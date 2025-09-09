import { UseSend } from "./usesend";
import { paths } from "../types/schema";
import { ErrorResponse } from "../types";

type CreateContactPayload =
  paths["/v1/contactBooks/{contactBookId}/contacts"]["post"]["requestBody"]["content"]["application/json"];

type CreateContactResponse = {
  data: CreateContactResponseSuccess | null;
  error: ErrorResponse | null;
};

type CreateContactResponseSuccess =
  paths["/v1/contactBooks/{contactBookId}/contacts"]["post"]["responses"]["200"]["content"]["application/json"];

type GetContactResponseSuccess =
  paths["/v1/contactBooks/{contactBookId}/contacts/{contactId}"]["get"]["responses"]["200"]["content"]["application/json"];

type GetContactResponse = {
  data: GetContactResponseSuccess | null;
  error: ErrorResponse | null;
};

type UpdateContactPayload =
  paths["/v1/contactBooks/{contactBookId}/contacts/{contactId}"]["patch"]["requestBody"]["content"]["application/json"];

type UpdateContactResponseSuccess =
  paths["/v1/contactBooks/{contactBookId}/contacts/{contactId}"]["patch"]["responses"]["200"]["content"]["application/json"];

type UpdateContactResponse = {
  data: UpdateContactResponseSuccess | null;
  error: ErrorResponse | null;
};

type UpsertContactPayload =
  paths["/v1/contactBooks/{contactBookId}/contacts/{contactId}"]["put"]["requestBody"]["content"]["application/json"];

type UpsertContactResponseSuccess =
  paths["/v1/contactBooks/{contactBookId}/contacts/{contactId}"]["put"]["responses"]["200"]["content"]["application/json"];

type UpsertContactResponse = {
  data: UpsertContactResponseSuccess | null;
  error: ErrorResponse | null;
};

type DeleteContactResponse = {
  data: { success: boolean } | null;
  error: ErrorResponse | null;
};

export class Contacts {
  constructor(private readonly usesend: UseSend) {
    this.usesend = usesend;
  }

  async create(
    contactBookId: string,
    payload: CreateContactPayload
  ): Promise<CreateContactResponse> {
    const data = await this.usesend.post<CreateContactResponseSuccess>(
      `/contactBooks/${contactBookId}/contacts`,
      payload
    );

    return data;
  }

  async get(
    contactBookId: string,
    contactId: string
  ): Promise<GetContactResponse> {
    const data = await this.usesend.get<GetContactResponseSuccess>(
      `/contactBooks/${contactBookId}/contacts/${contactId}`
    );
    return data;
  }

  async update(
    contactBookId: string,
    contactId: string,
    payload: UpdateContactPayload
  ): Promise<UpdateContactResponse> {
    const data = await this.usesend.patch<UpdateContactResponseSuccess>(
      `/contactBooks/${contactBookId}/contacts/${contactId}`,
      payload
    );

    return data;
  }

  async upsert(
    contactBookId: string,
    contactId: string,
    payload: UpsertContactPayload
  ): Promise<UpsertContactResponse> {
    const data = await this.usesend.put<UpsertContactResponseSuccess>(
      `/contactBooks/${contactBookId}/contacts/${contactId}`,
      payload
    );

    return data;
  }

  async delete(
    contactBookId: string,
    contactId: string
  ): Promise<DeleteContactResponse> {
    const data = await this.usesend.delete<{ success: boolean }>(
      `/contactBooks/${contactBookId}/contacts/${contactId}`
    );

    return data;
  }
}
