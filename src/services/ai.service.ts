import Anthropic from '@anthropic-ai/sdk';

import config from '../config/env';
import ApiError from '../utils/ApiError';
import { isUuid } from '../utils/uuid';

/**
 * Dogal dil harcama ayristirma (3.5.1).
 *
 * NEDEN "TOOL USE" — SERBEST METIN AYRISTIRMA DEGIL
 * -------------------------------------------------
 * Modelden JSON metni isteyip onu parse etmek yerine Anthropic'in *tool use*
 * ozelligini kullaniyoruz ve `tool_choice: { type: 'any' }` ile modeli **iki
 * araçtan birini secmeye zorluyoruz**. Boylece cikti her zaman ya gecerli bir
 * "harcama olustur" cagrisi ya da "sunu netlestir" cagrisi olur; arada serbest
 * metin, yarim JSON ya da "elbette, iste harcamaniz:" gibi bir onsoz olamaz.
 *
 * IKI ARAC, TEK KARAR
 * -------------------
 * - create_expense    : mesaj yeterince net -> harcama olusturulabilir.
 * - ask_clarification : mesaj belirsiz (tutar yok, kim odedi/kim dahil belli
 *                       degil) -> HARCAMA OLUSTURULMAZ, kullaniciya soru sorulur.
 * Ayrimin gerekcesi docs/decisions/grup-detay-sohbet.md icinde.
 *
 * MODEL SECIMI
 * ------------
 * Isi metin-only ama en kritik parca **isim/katilimci eslestirme** ("Ece'ye",
 * "bana ve Kerem'e"): yanlis kisiye borc yazmak sessiz bir hata olur. Bu risk
 * yuzunden Haiku yerine Sonnet varsayilan (config.anthropicModel, env ile
 * degistirilebilir).
 *
 * Bu modul HTTP'yi bilmez ama uygulama servis katmani zaten ApiError firlatiyor
 * (bkz. expense.service); tutarli olsun diye yapilandirma/ust-servis hatalari
 * burada da ApiError olarak yukselir.
 */

/** Ayristirma icin modele verilen uye gorunumu. `nickname` istegi atan kisinin
 *  o uyeye verdigi ad — "Ev Arkadasi 300 lira" gibi mesajlari eslestirebilsin. */
export interface AiGroupMember {
  userId: string;
  name: string;
  nickname?: string | null;
}

/** Mesaj yeterince netse: harcama olusturulabilir. `paidByUserId` null ise
 *  cagiran taraf varsayilan olarak mesaji gonderen kisiyi kullanir.
 *  `participantUserIds` bos ise harcama tum gruba esit bolunur. */
export interface ParsedExpense {
  kind: 'expense';
  amount: number;
  description: string;
  paidByUserId: string | null;
  participantUserIds: string[];
}

/** Mesaj belirsizse: harcama YOK, kullaniciya sorulacak tek soru. */
export interface ParsedClarification {
  kind: 'clarification';
  question: string;
}

export type ParseResult = ParsedExpense | ParsedClarification;

/* ------------------------------------------------------------- arac semasi */

/**
 * create_expense: mesaj tamamlanabilirse. `splitType` su an yalnizca 'equal'
 * — chat uzerinden kisi basi ayri tutar gerektiren bolusmeler desteklenmiyor,
 * onlar forma birakildi (bkz. karar dokumani). paidByUserId nullable: kim
 * odedigi belirtilmemisse model null birakir.
 */
const CREATE_EXPENSE_TOOL: Anthropic.Tool = {
  name: 'create_expense',
  description:
    'Mesaj yeterince netse harcamayi olusturmak icin bunu cagir. Tutar belliyse ' +
    've kimin dahil oldugu anlasiliyorsa kullan.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      amount: {
        type: 'number',
        description: 'Harcama tutari, TL. Ornek: 300 veya 42.50. En fazla 2 ondalik.',
      },
      description: {
        type: 'string',
        description: 'Kisa aciklama. Ornek: "market", "aksam yemegi", "benzin".',
      },
      paidByUserId: {
        type: ['string', 'null'],
        description:
          'Odemeyi yapan uyenin userId degeri. Kim odedigi belirtilmemisse null birak; ' +
          'varsayilan olarak mesaji gonderen kisi kabul edilir.',
      },
      splitType: {
        type: 'string',
        enum: ['equal'],
        description: 'Bolusme tipi. Su an yalnizca esit bolusme ("equal") destekleniyor.',
      },
      participantUserIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Harcamaya dahil uyelerin userId listesi. "herkese/hepimize" ise TUM uyelerin ' +
          'id lerini koy; ya da bos birak, o zaman tum gruba esit bolunur.',
      },
    },
    required: ['amount', 'description', 'paidByUserId', 'splitType', 'participantUserIds'],
  },
};

/**
 * ask_clarification: mesaj belirsizse. Harcama olusturulmaz; kullaniciya tek
 * bir netlestirici soru sorulur.
 */
const ASK_CLARIFICATION_TOOL: Anthropic.Tool = {
  name: 'ask_clarification',
  description:
    'Mesaj harcama olusturmak icin belirsizse (tutar yok, kim odedi/kim dahil belli degil) ' +
    'bunu cagir. Harcama OLUSTURMA.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      question: {
        type: 'string',
        description: 'Kullaniciya sorulacak, harcamayi netlestiren tek bir Turkce soru.',
      },
    },
    required: ['question'],
  },
};

/* --------------------------------------------------------------- yardimci */

let cachedClient: Anthropic | null = null;

/** Istemciyi tembel kurar: API anahtari yoksa uygulama acilisi degil, yalnizca
 *  bu ucun cagrisi patlasin (503). Anahtar bir kez okunur, istemci cache lenir. */
const getClient = (): Anthropic => {
  if (!config.anthropicApiKey) {
    throw new ApiError(503, 'Dogal dil harcama servisi yapilandirilmamis (ANTHROPIC_API_KEY yok)');
  }

  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  return cachedClient;
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Modelin dondurdugu userId yalnizca gercek bir uyeyse gecerli sayilir; boylece
 *  model bir id uydurursa (halusinasyon) harcama servisinde 400'e donusmez. */
const buildParsedExpense = (
  input: Record<string, unknown>,
  memberIds: Set<string>
): ParsedExpense => {
  const rawParticipants = Array.isArray(input.participantUserIds) ? input.participantUserIds : [];
  const participantUserIds = rawParticipants
    .map((value) => asString(value))
    .filter((id) => memberIds.has(id));

  const rawPaidBy = asString(input.paidByUserId);
  const paidByUserId = isUuid(rawPaidBy) && memberIds.has(rawPaidBy) ? rawPaidBy : null;

  return {
    kind: 'expense',
    amount: typeof input.amount === 'number' ? input.amount : Number(asString(input.amount)),
    description: asString(input.description).trim(),
    paidByUserId,
    participantUserIds,
  };
};

/* ---------------------------------------------------------------- islem */

/**
 * Dogal dil mesajini ya bir harcamaya ya da bir netlestirme sorusuna cevirir.
 *
 * @param text     Kullanicinin yazdigi ham metin.
 * @param members  Gruptaki uyeler (isim/takma isimle) — model id-isim eslemesi yapar.
 * @param defaultPayerUserId  Mesaji gonderen; yalnizca sistem mesajinda bilgi olarak
 *                            gecer, esas varsayilan atama cagiran serviste yapilir.
 */
const parseExpenseMessage = async (
  text: string,
  members: readonly AiGroupMember[],
  defaultPayerUserId: string
): Promise<ParseResult> => {
  const client = getClient();
  const memberIds = new Set(members.map((member) => member.userId));

  const roster = members
    .map((member) => {
      const alias = member.nickname ? ` (takma ad: ${member.nickname})` : '';
      const isSender = member.userId === defaultPayerUserId ? ' [mesaji gonderen]' : '';
      return `- ${member.userId} — ${member.name}${alias}${isSender}`;
    })
    .join('\n');

  const system =
    'Bir grup gider/borc uygulamasinda dogal dil harcama asistanisin. Kullanicinin ' +
    'mesajini oku ve MUTLAKA su iki araçtan birini cagir: net ve tamamlanabilir bir ' +
    'harcamaysa create_expense; belirsizse (tutar yok, kim odedi ya da kim dahil belli ' +
    'degil) ask_clarification.\n\n' +
    'Kurallar:\n' +
    '- Tutar TL cinsinden, en fazla 2 ondalik.\n' +
    '- Katilimci/odeyen icin YALNIZCA asagidaki listedeki userId degerlerini kullan; ' +
    'isim uydurma, listede olmayan birine borc yazma.\n' +
    '- "herkese/hepimize/esit" -> tum uyeler dahil (participantUserIds bos birakilabilir).\n' +
    '- Kim odedigi belirtilmemisse paidByUserId = null.\n' +
    '- Bir isim listedeki birden fazla kisiye uyuyor ve hangisi oldugu belirsizse ' +
    'ask_clarification kullan.\n\n' +
    `Grup uyeleri (userId — ad):\n${roster}`;

  let response;
  try {
    response = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 1024,
      system,
      tools: [CREATE_EXPENSE_TOOL, ASK_CLARIFICATION_TOOL],
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: text }],
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Anthropic tarafi hata verdi (ag, kota, 5xx). Kullanicinin mesaji zaten
    // feed'e kaydedildi; burada net bir "tekrar dene" hatasi donuyoruz.
    throw new ApiError(502, 'Harcama mesaji su an okunamadi, lutfen tekrar deneyin');
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );

  // tool_choice: 'any' geregi normalde buraya dusulmez; model yine de araç
  // cagirmadiysa netlestirmeye dusuruyoruz (harcama olusturmaktan guvenli taraf).
  if (!toolUse) {
    throw new ApiError(502, 'Harcama mesaji anlasilamadi, lutfen tekrar deneyin');
  }

  const input = (
    typeof toolUse.input === 'object' && toolUse.input !== null ? toolUse.input : {}
  ) as Record<string, unknown>;

  if (toolUse.name === 'create_expense') {
    return buildParsedExpense(input, memberIds);
  }

  return { kind: 'clarification', question: asString(input.question).trim() };
};

export default { parseExpenseMessage };

export { parseExpenseMessage };
