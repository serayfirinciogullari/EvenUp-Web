import messageModel from '../models/message.model';
import groupModel from '../models/group.model';
import ApiError from '../utils/ApiError';
import { buildPagination, parsePagination } from '../utils/pagination';
import aiService from './ai.service';
import { createExpense } from './expense.service';
import { requireMembership } from './group.service';

import type { FeedExpenseSummary, GroupMessageView, MessagePage } from '../models/message.model';
import type { GroupMessageRow } from '../types/models';
import type { PublicExpense } from './expense.service';
import type { PageQuery, Pagination } from '../utils/pagination';
import type { AiGroupMember } from './ai.service';

/**
 * Grup sohbeti is mantigi.
 *
 * IKI GIRIS, TEK CIKIS
 * --------------------
 * Bir harcama uc yoldan olusabilir: manuel form (1.5), dogal dil mesaji (burada)
 * ve fis onayi (3.5.2, ertelendi). Uçunun de feed'e "expense_created" satiri
 * eklemesi gerekir. Bu satiri BURADA tekrar yazmiyoruz: dogal dil yolu da
 * expense.service.createExpense'i cagirir ve feed satiri o fonksiyonun icinde
 * uretilir (DRY). Yani bu servis harcama olusturmaz, yalnizca AI kararini
 * mevcut servise baglar. Gerekce docs/decisions/grup-detay-sohbet.md
 *
 * YETKI
 * -----
 * Iki uc da 1.4'teki `requireMembership`ten gecer: yalnizca grup uyeleri mesaj
 * gonderebilir/gorebilir; uye olmayan ayni 403'u alir.
 */

const MAX_MESSAGE_LENGTH = 2000;

export interface PostMessageResult {
  /** Yeni eklenen feed satir(lar)i: kullanicinin mesaji + AI'in cevabi. */
  messages: GroupMessageView[];
}

export interface ListMessageResult {
  messages: GroupMessageView[];
  pagination: Pagination;
}

export type ListQuery = PageQuery;

/* ------------------------------------------------------------- yardimcilar */

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Insert/okuma sonucu ham satiri feed gorunumune cevirir. expense_created
 *  disindaki turlerde harcama ozeti yoktur (`null`). */
const toView = (
  row: GroupMessageRow,
  expense: FeedExpenseSummary | null = null
): GroupMessageView => ({
  id: row.id,
  group_id: row.group_id,
  sender_id: row.sender_id,
  type: row.type,
  content: row.content,
  expense_id: row.expense_id,
  receipt_draft_id: row.receipt_draft_id,
  created_at: row.created_at,
  expense,
});

/** createExpense'in dondurdugu harcamadan feed ozeti — ekstra bir okuma yok. */
const summaryOf = (expense: PublicExpense): FeedExpenseSummary => ({
  id: expense.id,
  amount: expense.amount,
  description: expense.description,
  category: expense.category,
  paid_by: expense.paid_by,
  created_by: expense.created_by,
});

const validateContent = (value: unknown): string => {
  const content = asString(value).trim();

  if (!content) {
    throw ApiError.badRequest('Mesaj bos olamaz', { content: 'Mesaj metni zorunlu' });
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    throw ApiError.badRequest('Mesaj cok uzun', {
      content: `Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir`,
    });
  }

  return content;
};

/** AI'in cikardigi harcamayi 1.5 servisinin bekledigi govdeye cevirir. */
const toCreateExpenseBody = (parsed: {
  amount: number;
  description: string;
  paidByUserId: string | null;
  participantUserIds: string[];
}): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    amount: parsed.amount,
    description: parsed.description,
    splitType: 'equal',
  };

  // paidBy verilmezse createExpense zaten gonderen kisiyi varsayar.
  if (parsed.paidByUserId) {
    body.paidBy = parsed.paidByUserId;
  }

  // Katilimci verilmezse createExpense tum gruba esit boler.
  if (parsed.participantUserIds.length > 0) {
    body.splitDetails = { participants: parsed.participantUserIds };
  }

  return body;
};

/* ---------------------------------------------------------------- islemler */

/**
 * POST /groups/:id/messages
 *
 * Sira: (1) uyelik dogrula, (2) kullanicinin metnini feed'e kaydet — AI ya da
 * harcama patlasa bile mesaj kaybolmasin, (3) AI'a ayristir, (4) net ise
 * harcamayi MEVCUT servisle olustur (feed satirini o ekler), belirsiz ise
 * netlestirme satiri ekle. Cevap: yeni feed satirlari.
 */
const postMessage = async (
  groupId: string,
  userId: string,
  body: Record<string, unknown>
): Promise<PostMessageResult> => {
  await requireMembership(groupId, userId);

  const content = validateContent(body.content);

  const userMessage = await messageModel.insertUserText({
    group_id: groupId,
    sender_id: userId,
    content,
  });

  // Model isim/takma-isim eslestirmesi yapabilsin diye uyeleri gonderenin
  // gozuyle (kisiye ozel takma isimlerle) veriyoruz.
  const members: AiGroupMember[] = (await groupModel.listMembers(groupId, userId)).map(
    (member) => ({
      userId: member.user_id,
      name: member.name,
      nickname: member.nickname,
    })
  );

  const parsed = await aiService.parseExpenseMessage(content, members, userId);

  if (parsed.kind === 'clarification') {
    const aiMessage = await messageModel.insertAiClarification({
      group_id: groupId,
      content: parsed.question,
    });

    return { messages: [toView(userMessage), toView(aiMessage)] };
  }

  // parsed.kind === 'expense': harcamayi mevcut servisle olustur.
  let expense: PublicExpense;
  try {
    expense = await createExpense(groupId, userId, toCreateExpenseBody(parsed));
  } catch (error) {
    // AI net bir harcama cikardi ama alanlar 1.5 dogrulamasindan gecmedi
    // (or. tutar bicimi). Kullanicinin mesaji zaten kayitli; hard 400 yerine
    // feed'de netlestirme satiriyla nazikce geri don.
    if (error instanceof ApiError && error.statusCode === 400) {
      const aiMessage = await messageModel.insertAiClarification({
        group_id: groupId,
        content: 'Harcamayi olusturamadim. Tutari ve aciklamayi net yazar misin?',
      });

      return { messages: [toView(userMessage), toView(aiMessage)] };
    }
    throw error;
  }

  // createExpense feed'e expense_created satirini ekledi; onu okuyup dondur.
  const expenseMessage = await messageModel.findExpenseCreatedByExpenseId(expense.id);

  const expenseView = expenseMessage
    ? toView(expenseMessage, summaryOf(expense))
    : // Teorik yaris: satir araya giren bir silmeyle gitmis olabilir. Feed yine
      // tutarli: sadece kullanicinin mesajini donuyoruz.
      null;

  return {
    messages: expenseView ? [toView(userMessage), expenseView] : [toView(userMessage)],
  };
};

/**
 * GET /groups/:id/messages?page=&limit=
 *
 * Sayfalanmis, en yeni ustte. expense_created satirlarinda harcama ozeti JOIN
 * ile geldigi icin arayuz ayrica /expenses/:id cagirmaz (bkz. message.model).
 */
const listMessages = async (
  groupId: string,
  userId: string,
  query: ListQuery = {}
): Promise<ListMessageResult> => {
  await requireMembership(groupId, userId);

  const page = parsePagination(query);
  const { messages, total }: MessagePage = await messageModel.listByGroup(groupId, {
    limit: page.limit,
    offset: page.offset,
  });

  return {
    messages,
    pagination: buildPagination(page, total),
  };
};

export default { postMessage, listMessages };

export { postMessage, listMessages, MAX_MESSAGE_LENGTH };
