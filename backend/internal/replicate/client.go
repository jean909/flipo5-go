package replicate

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	repgo "github.com/replicate/replicate-go"
)

const maxScanTokenSize = 4 * 1024 * 1024 // 4MB - Replicate can send long chunks, default 64KB causes truncation

type Client struct {
	client *repgo.Client
	token string
}

func New(token string) (*Client, error) {
	if token == "" {
		token = os.Getenv("REPLICATE_API_TOKEN")
	}
	cl, err := repgo.NewClient(repgo.WithToken(token))
	if err != nil {
		return nil, err
	}
	return &Client{client: cl, token: token}, nil
}

// Run runs a model and waits until done. identifier e.g. "meta/meta-llama-3-70b-instruct"
func (c *Client) Run(ctx context.Context, identifier string, input repgo.PredictionInput) (repgo.PredictionOutput, error) {
	return c.client.RunWithOptions(ctx, identifier, input, nil, repgo.WithBlockUntilDone())
}

// GetPrediction fetches prediction by ID
func (c *Client) GetPrediction(ctx context.Context, id string) (*repgo.Prediction, error) {
	return c.client.GetPrediction(ctx, id)
}

// CancelPrediction cancels a running prediction on Replicate so it doesn't stay pending
func (c *Client) CancelPrediction(ctx context.Context, id string) error {
	_, err := c.client.CancelPrediction(ctx, id)
	return err
}

// CreatePredictionWithStream creates a prediction with stream=true and returns the prediction (with URLs.Stream).
func (c *Client) CreatePredictionWithStream(ctx context.Context, identifier string, input repgo.PredictionInput) (*repgo.Prediction, error) {
	return c.client.CreatePrediction(ctx, identifier, input, nil, true)
}

// StreamOutput connects to the Replicate stream URL and calls onOutput for each "output" event and onDone on "done".
func (c *Client) StreamOutput(ctx context.Context, streamURL string, onOutput func(text string), onDone func()) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, streamURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("stream status %d", resp.StatusCode)
	}
	scanner := bufio.NewScanner(resp.Body)
	// Increase buffer: default 64KB causes "token too long" and truncation on long chunks
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, maxScanTokenSize)
	var curEvent, curData string
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			switch curEvent {
			case "output":
				if onOutput != nil && curData != "" {
					onOutput(curData)
				}
			case "done", "error":
				if onDone != nil {
					onDone()
				}
				return nil
			}
			curEvent, curData = "", ""
			continue
		}
		if strings.HasPrefix(trimmed, "event:") {
			curEvent = strings.TrimSpace(strings.TrimPrefix(trimmed, "event:"))
		} else if strings.HasPrefix(trimmed, "data:") {
			d := strings.TrimPrefix(trimmed, "data:")
			if len(d) > 0 && d[0] == ' ' {
				d = d[1:]
			}
			if curData != "" {
				curData += "\n" + d
			} else {
				curData = d
			}
		}
	}
	// stream ended without done (e.g. timeout)
	if onDone != nil {
		onDone()
	}
	return scanner.Err()
}
