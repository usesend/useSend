package usesend

import "context"

type Attachment struct {
	Filename string `json:"filename"`
	Content  string `json:"content"`
}

type SendEmailPayload struct {
	To          []string          `json:"to"`
	From        string            `json:"from"`
	Subject     string            `json:"subject,omitempty"`
	TemplateID  string            `json:"templateId,omitempty"`
	Variables   map[string]string `json:"variables,omitempty"`
	ReplyTo     []string          `json:"replyTo,omitempty"`
	CC          []string          `json:"cc,omitempty"`
	BCC         []string          `json:"bcc,omitempty"`
	Text        string            `json:"text,omitempty"`
	HTML        string            `json:"html,omitempty"`
	Attachments []Attachment      `json:"attachments,omitempty"`
	ScheduledAt string            `json:"scheduledAt,omitempty"`
	InReplyToID string            `json:"inReplyToId,omitempty"`
}

type CreateEmailResponse struct {
	EmailID string `json:"emailId"`
}

type Email struct {
	ID          string       `json:"id"`
	TeamID      int          `json:"teamId"`
	To          []string     `json:"to"`
	ReplyTo     []string     `json:"replyTo,omitempty"`
	CC          []string     `json:"cc,omitempty"`
	BCC         []string     `json:"bcc,omitempty"`
	From        string       `json:"from"`
	Subject     string       `json:"subject"`
	HTML        string       `json:"html"`
	Text        string       `json:"text"`
	CreatedAt   string       `json:"createdAt"`
	UpdatedAt   string       `json:"updatedAt"`
	EmailEvents []EmailEvent `json:"emailEvents"`
}

type EmailEvent struct {
	EmailID   string `json:"emailId"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
	Data      any    `json:"data,omitempty"`
}

type UpdateEmailPayload struct {
	ScheduledAt string `json:"scheduledAt"`
}

type BatchEmailResponse struct {
	Data []CreateEmailResponse `json:"data"`
}

type EmailsService struct {
	client *Client
}

func (e *EmailsService) Create(ctx context.Context, payload SendEmailPayload) (CreateEmailResponse, *ErrorResponse, error) {
	var resp CreateEmailResponse
	errResp, err := e.client.post(ctx, "/emails", payload, &resp)
	return resp, errResp, err
}

func (e *EmailsService) Send(ctx context.Context, payload SendEmailPayload) (CreateEmailResponse, *ErrorResponse, error) {
	return e.Create(ctx, payload)
}

func (e *EmailsService) Batch(ctx context.Context, payload []SendEmailPayload) (BatchEmailResponse, *ErrorResponse, error) {
	var resp BatchEmailResponse
	errResp, err := e.client.post(ctx, "/emails/batch", payload, &resp)
	return resp, errResp, err
}

func (e *EmailsService) Get(ctx context.Context, id string) (Email, *ErrorResponse, error) {
	var resp Email
	errResp, err := e.client.get(ctx, "/emails/"+id, &resp)
	return resp, errResp, err
}

func (e *EmailsService) Update(ctx context.Context, id string, payload UpdateEmailPayload) (CreateEmailResponse, *ErrorResponse, error) {
	var resp CreateEmailResponse
	errResp, err := e.client.patch(ctx, "/emails/"+id, payload, &resp)
	return resp, errResp, err
}

func (e *EmailsService) Cancel(ctx context.Context, id string) (CreateEmailResponse, *ErrorResponse, error) {
	var resp CreateEmailResponse
	errResp, err := e.client.post(ctx, "/emails/"+id+"/cancel", nil, &resp)
	return resp, errResp, err
}
