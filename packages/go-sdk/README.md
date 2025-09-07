# UseSend Go SDK

A Go client for the [UseSend](https://app.usesend.com) API.

## Installation

```bash
go get github.com/usesend/go-sdk
```

## Usage

```go
package main

import (
    "context"
    "log"

    usesend "github.com/usesend/go-sdk"
)

func main() {
    client, err := usesend.NewClient("us_123")
    if err != nil {
        log.Fatal(err)
    }

    resp, errResp, err := client.Emails.Send(context.Background(), usesend.SendEmailPayload{
        To:   []string{"user@example.com"},
        From: "no-reply@example.com",
        Subject: "Hello",
        HTML:    "<p>Hi there!</p>",
    })
    if err != nil {
        log.Fatal(err)
    }
    if errResp != nil {
        log.Fatalf("api error: %s", errResp.Message)
    }

    log.Printf("email queued with id %s", resp.EmailID)
}
```

API keys can also be supplied via the `USESEND_API_KEY` environment variable.
