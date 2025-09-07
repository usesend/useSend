package usesend

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
)

const defaultBaseURL = "https://app.usesend.com/api/v1"

type Client struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client

	Emails   *EmailsService
	Contacts *ContactsService
}

type ClientOption func(*Client)

func WithBaseURL(url string) ClientOption {
	return func(c *Client) {
		c.baseURL = url
	}
}

func WithHTTPClient(h *http.Client) ClientOption {
	return func(c *Client) {
		c.httpClient = h
	}
}

func NewClient(apiKey string, opts ...ClientOption) (*Client, error) {
	if apiKey == "" {
		apiKey = os.Getenv("USESEND_API_KEY")
		if apiKey == "" {
			apiKey = os.Getenv("UNSEND_API_KEY")
		}
		if apiKey == "" {
			return nil, errors.New("missing API key")
		}
	}

	c := &Client{
		apiKey:     apiKey,
		baseURL:    defaultBaseURL,
		httpClient: http.DefaultClient,
	}

	for _, opt := range opts {
		opt(c)
	}

	c.Emails = &EmailsService{client: c}
	c.Contacts = &ContactsService{client: c}

	return c, nil
}

func (c *Client) doRequest(ctx context.Context, method, path string, body any, v any) (*ErrorResponse, error) {
	var buf io.Reader
	if body != nil {
		b := &bytes.Buffer{}
		if err := json.NewEncoder(b).Encode(body); err != nil {
			return nil, err
		}
		buf = b
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if v != nil {
			if err := json.NewDecoder(resp.Body).Decode(v); err != nil && err != io.EOF {
				return nil, err
			}
		}
		return nil, nil
	}

	errResp := &ErrorResponse{Message: resp.Status, Code: "INTERNAL_SERVER_ERROR"}
	if err := json.NewDecoder(resp.Body).Decode(errResp); err != nil {
		// use default errResp
	}
	return errResp, nil
}

func (c *Client) get(ctx context.Context, path string, out any) (*ErrorResponse, error) {
	return c.doRequest(ctx, http.MethodGet, path, nil, out)
}

func (c *Client) post(ctx context.Context, path string, body any, out any) (*ErrorResponse, error) {
	return c.doRequest(ctx, http.MethodPost, path, body, out)
}

func (c *Client) put(ctx context.Context, path string, body any, out any) (*ErrorResponse, error) {
	return c.doRequest(ctx, http.MethodPut, path, body, out)
}

func (c *Client) patch(ctx context.Context, path string, body any, out any) (*ErrorResponse, error) {
	return c.doRequest(ctx, http.MethodPatch, path, body, out)
}

func (c *Client) delete(ctx context.Context, path string, body any, out any) (*ErrorResponse, error) {
	return c.doRequest(ctx, http.MethodDelete, path, body, out)
}
