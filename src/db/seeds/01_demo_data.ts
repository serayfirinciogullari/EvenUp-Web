import bcrypt from 'bcryptjs';
import type { Knex } from 'knex';

import type {
  ExpenseInsert,
  ExpenseShareInsert,
  GroupInsert,
  GroupMemberInsert,
  UserInsert,
} from '../../types/models';

/**
 * Gelistirme ortami icin ornek veri.
 *
 * ID'ler sabit UUID olarak yazildi; boylece seed tekrar calistiginda ayni
 * kayitlar olusur ve Postman koleksiyonlarindaki id'ler bozulmaz.
 */

const SEED_PASSWORD = 'Password123!';

const USER_IDS = {
  admin: '11111111-1111-4111-8111-111111111111',
  deniz: '22222222-2222-4222-8222-222222222222',
  ece: '33333333-3333-4333-8333-333333333333',
  kerem: '44444444-4444-4444-8444-444444444444',
} as const;

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const EXPENSE_IDS = {
  market: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  internet: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  yemek: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
} as const;

export async function seed(knex: Knex): Promise<void> {
  // FK sirasina dikkat: once cocuk tablolar temizlenir
  await knex('settlements').del();
  await knex('expense_shares').del();
  await knex('expenses').del();
  await knex('group_members').del();
  await knex('groups').del();
  await knex('users').del();

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const users: UserInsert[] = [
    {
      id: USER_IDS.admin,
      email: 'admin@evenup.dev',
      name: 'Admin Kullanici',
      password_hash: passwordHash,
      role: 'admin',
    },
    {
      id: USER_IDS.deniz,
      email: 'deniz@evenup.dev',
      name: 'Deniz Kaya',
      password_hash: passwordHash,
      role: 'user',
    },
    {
      id: USER_IDS.ece,
      email: 'ece@evenup.dev',
      name: 'Ece Demir',
      password_hash: passwordHash,
      role: 'user',
    },
    {
      id: USER_IDS.kerem,
      email: 'kerem@evenup.dev',
      name: 'Kerem Aydin',
      password_hash: passwordHash,
      role: 'user',
    },
  ];

  await knex('users').insert(users);

  const group: GroupInsert = {
    id: GROUP_ID,
    name: 'Ev Arkadaslari',
    created_by: USER_IDS.admin,
  };

  await knex('groups').insert(group);

  const members: GroupMemberInsert[] = Object.values(USER_IDS).map((userId) => ({
    group_id: GROUP_ID,
    user_id: userId,
  }));

  await knex('group_members').insert(members);

  const expenses: ExpenseInsert[] = [
    {
      id: EXPENSE_IDS.market,
      group_id: GROUP_ID,
      paid_by: USER_IDS.admin,
      amount: '300.00',
      description: 'Haftalik market alisverisi',
      category: 'market',
    },
    {
      id: EXPENSE_IDS.internet,
      group_id: GROUP_ID,
      paid_by: USER_IDS.deniz,
      amount: '240.00',
      description: 'Internet faturasi',
      category: 'fatura',
    },
    {
      id: EXPENSE_IDS.yemek,
      group_id: GROUP_ID,
      paid_by: USER_IDS.ece,
      amount: '180.00',
      description: 'Cuma aksami pizza',
      category: 'yemek',
    },
  ];

  await knex('expenses').insert(expenses);

  const shares: ExpenseShareInsert[] = [
    // 300.00 dort kisiye esit bolundu
    { expense_id: EXPENSE_IDS.market, user_id: USER_IDS.admin, share_amount: '75.00' },
    { expense_id: EXPENSE_IDS.market, user_id: USER_IDS.deniz, share_amount: '75.00' },
    { expense_id: EXPENSE_IDS.market, user_id: USER_IDS.ece, share_amount: '75.00' },
    { expense_id: EXPENSE_IDS.market, user_id: USER_IDS.kerem, share_amount: '75.00' },

    // 240.00 dort kisiye esit bolundu
    { expense_id: EXPENSE_IDS.internet, user_id: USER_IDS.admin, share_amount: '60.00' },
    { expense_id: EXPENSE_IDS.internet, user_id: USER_IDS.deniz, share_amount: '60.00' },
    { expense_id: EXPENSE_IDS.internet, user_id: USER_IDS.ece, share_amount: '60.00' },
    { expense_id: EXPENSE_IDS.internet, user_id: USER_IDS.kerem, share_amount: '60.00' },

    // 180.00: Kerem o aksam yoktu, uc kisiye bolundu
    { expense_id: EXPENSE_IDS.yemek, user_id: USER_IDS.admin, share_amount: '60.00' },
    { expense_id: EXPENSE_IDS.yemek, user_id: USER_IDS.deniz, share_amount: '60.00' },
    { expense_id: EXPENSE_IDS.yemek, user_id: USER_IDS.ece, share_amount: '60.00' },
  ];

  await knex('expense_shares').insert(shares);
}
