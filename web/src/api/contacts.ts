import api from './client';

import type { Contact, ContactListResult } from '../types/models';

/**
 * "Kisiler" sayfasi uc noktasi.
 *
 * `/users/me/*` altinda ama `api/users.ts`e degil buraya konuldu: o dosya
 * profil/sifre gibi **yazma** islemlerini topluyor, bu ise `api/activity.ts`
 * ile ayni ailede — tek bir okuma, tum ortak grup gecmisi uzerinden toplu
 * (bkz. docs/decisions/kisiler-sayfasi.md).
 */

/** `GET /users/me/contacts` — ortak grubu olunan herkes + toplam net bakiye. */
export const getContacts = async (): Promise<Contact[]> => {
  const { data } = await api.get<ContactListResult>('/users/me/contacts');
  return data.contacts;
};

export default { getContacts };
