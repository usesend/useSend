package usesend

import "context"

type Contact struct {
	ID            string            `json:"id"`
	FirstName     string            `json:"firstName,omitempty"`
	LastName      string            `json:"lastName,omitempty"`
	Email         string            `json:"email"`
	Subscribed    bool              `json:"subscribed"`
	Properties    map[string]string `json:"properties"`
	ContactBookID string            `json:"contactBookId"`
	CreatedAt     string            `json:"createdAt"`
	UpdatedAt     string            `json:"updatedAt"`
}

type CreateContactPayload struct {
	Email      string            `json:"email"`
	FirstName  string            `json:"firstName,omitempty"`
	LastName   string            `json:"lastName,omitempty"`
	Properties map[string]string `json:"properties,omitempty"`
	Subscribed bool              `json:"subscribed,omitempty"`
}

type UpdateContactPayload struct {
	FirstName  string            `json:"firstName,omitempty"`
	LastName   string            `json:"lastName,omitempty"`
	Properties map[string]string `json:"properties,omitempty"`
	Subscribed bool              `json:"subscribed,omitempty"`
}

type CreateContactResponse struct {
	ContactID string `json:"contactId"`
}

type DeleteContactResponse struct {
	Success bool `json:"success"`
}

type ContactsService struct {
	client *Client
}

func (c *ContactsService) Create(ctx context.Context, contactBookID string, payload CreateContactPayload) (CreateContactResponse, *ErrorResponse, error) {
	var resp CreateContactResponse
	errResp, err := c.client.post(ctx, "/contactBooks/"+contactBookID+"/contacts", payload, &resp)
	return resp, errResp, err
}

func (c *ContactsService) Get(ctx context.Context, contactBookID, contactID string) (Contact, *ErrorResponse, error) {
	var resp Contact
	errResp, err := c.client.get(ctx, "/contactBooks/"+contactBookID+"/contacts/"+contactID, &resp)
	return resp, errResp, err
}

func (c *ContactsService) Update(ctx context.Context, contactBookID, contactID string, payload UpdateContactPayload) (CreateContactResponse, *ErrorResponse, error) {
	var resp CreateContactResponse
	errResp, err := c.client.patch(ctx, "/contactBooks/"+contactBookID+"/contacts/"+contactID, payload, &resp)
	return resp, errResp, err
}

func (c *ContactsService) Upsert(ctx context.Context, contactBookID, contactID string, payload CreateContactPayload) (CreateContactResponse, *ErrorResponse, error) {
	var resp CreateContactResponse
	errResp, err := c.client.put(ctx, "/contactBooks/"+contactBookID+"/contacts/"+contactID, payload, &resp)
	return resp, errResp, err
}

func (c *ContactsService) Delete(ctx context.Context, contactBookID, contactID string) (DeleteContactResponse, *ErrorResponse, error) {
	var resp DeleteContactResponse
	errResp, err := c.client.delete(ctx, "/contactBooks/"+contactBookID+"/contacts/"+contactID, nil, &resp)
	return resp, errResp, err
}
