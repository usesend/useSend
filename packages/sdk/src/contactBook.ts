import { UseSend } from "./usesend";
import { paths } from "../types/schema";
import { ErrorResponse } from "../types";

type GetAllContactBooksResponseSuccess =
  paths["/v1/contactBooks"]["get"]["responses"]["200"]["content"]["application/json"];

type GetAllContactBooksResponse = {
  data: GetAllContactBooksResponseSuccess | null;
  error: ErrorResponse | null;
};

type CreateContactBookPayload =
  paths["/v1/contactBooks"]["post"]["requestBody"]["content"]["application/json"];

type CreateContactBookResponseSuccess =
  paths["/v1/contactBooks"]["post"]["responses"]["200"]["content"]["application/json"];

type CreateContactBookResponse = {
  data: CreateContactBookResponseSuccess | null;
  error: ErrorResponse | null;
};

type GetContactBookResponseSuccess =
  paths["/v1/contactBooks/{contactBookId}"]["get"]["responses"]["200"]["content"]["application/json"];

type GetContactBookResponse = {
  data: GetContactBookResponseSuccess | null;
  error: ErrorResponse | null;
};

type UpdateContactBookPayload =
  paths["/v1/contactBooks/{contactBookId}"]["patch"]["requestBody"]["content"]["application/json"];

type UpdateContactBookResponseSuccess =
  paths["/v1/contactBooks/{contactBookId}"]["patch"]["responses"]["200"]["content"]["application/json"];

type UpdateContactBookResponse = {
  data: UpdateContactBookResponseSuccess | null;
  error: ErrorResponse | null;
};

type DeleteContactBookResponseSuccess =
  paths["/v1/contactBooks/{contactBookId}"]["delete"]["responses"]["200"]["content"]["application/json"];

type DeleteContactBookResponse = {
  data: DeleteContactBookResponseSuccess | null;
  error: ErrorResponse | null;
};

export class ContactBooks {
  constructor(private readonly usesend: UseSend) {
    this.usesend = usesend;
  }

  async list(): Promise<GetAllContactBooksResponse> {
    const data = await this.usesend.get<GetAllContactBooksResponseSuccess>(
      `/contactBooks`,
    );
    return data;
  }

  async get(contactBookId: string): Promise<GetContactBookResponse> {
    const data = await this.usesend.get<GetContactBookResponseSuccess>(
      `/contactBooks/${contactBookId}`,
    );
    return data;
  }

  async create(
    payload: CreateContactBookPayload,
  ): Promise<CreateContactBookResponse> {
    const data = await this.usesend.post<CreateContactBookResponseSuccess>(
      `/contactBooks`,
      payload,
    );
    return data;
  }

  async update(
    contactBookId: string,
    payload: UpdateContactBookPayload,
  ): Promise<UpdateContactBookResponse> {
    const data = await this.usesend.patch<UpdateContactBookResponseSuccess>(
      `/contactBooks/${contactBookId}`,
      payload,
    );
    return data;
  }

  async delete(contactBookId: string): Promise<DeleteContactBookResponse> {
    const data = await this.usesend.delete<DeleteContactBookResponseSuccess>(
      `/contactBooks/${contactBookId}`,
    );
    return data;
  }
}
