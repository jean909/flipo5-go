package stream

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// ChunkMsg is published per chunk; Output is cumulative text so far
type ChunkMsg struct {
	Output string `json:"output"`
	Done   bool   `json:"done,omitempty"`
}

func channelKey(jobID uuid.UUID) string {
	return "stream:" + jobID.String()
}

// Publisher publishes stream chunks to Redis (worker-side)
type Publisher struct {
	rdb *redis.Client
}

func NewPublisher(redisURL string) (*Publisher, error) {
	u := redisURL
	if u != "" && !strings.HasPrefix(u, "redis://") && !strings.HasPrefix(u, "rediss://") {
		u = "redis://" + u
	}
	opt, err := redis.ParseURL(u)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opt)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return &Publisher{rdb: rdb}, nil
}

func (p *Publisher) Publish(ctx context.Context, jobID uuid.UUID, output string, done bool) error {
	if p == nil || p.rdb == nil {
		return nil
	}
	msg := ChunkMsg{Output: output, Done: done}
	b, _ := json.Marshal(msg)
	return p.rdb.Publish(ctx, channelKey(jobID), string(b)).Err()
}

// PublishRaw publishes raw message to any channel (for user-specific job updates)
func (p *Publisher) PublishRaw(ctx context.Context, channel, message string) error {
	if p == nil || p.rdb == nil {
		return nil
	}
	return p.rdb.Publish(ctx, channel, message).Err()
}

func (p *Publisher) Close() error {
	if p != nil && p.rdb != nil {
		return p.rdb.Close()
	}
	return nil
}

// Subscriber receives stream chunks from Redis (API-side)
type Subscriber struct {
	rdb *redis.Client
}

func NewSubscriber(redisURL string) (*Subscriber, error) {
	u := redisURL
	if u != "" && !strings.HasPrefix(u, "redis://") && !strings.HasPrefix(u, "rediss://") {
		u = "redis://" + u
	}
	opt, err := redis.ParseURL(u)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opt)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return &Subscriber{rdb: rdb}, nil
}

func (s *Subscriber) Subscribe(ctx context.Context, jobID uuid.UUID, onChunk func(output string, done bool)) error {
	if s == nil || s.rdb == nil {
		return nil
	}
	pubsub := s.rdb.Subscribe(ctx, channelKey(jobID))
	defer pubsub.Close()
	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			var m ChunkMsg
			if json.Unmarshal([]byte(msg.Payload), &m) == nil {
				onChunk(m.Output, m.Done)
				if m.Done {
					return nil
				}
			}
		}
	}
}

// SubscribeRaw subscribes to a channel and returns pubsub object for custom handling
func (s *Subscriber) SubscribeRaw(ctx context.Context, channel string) *redis.PubSub {
	if s == nil || s.rdb == nil {
		return nil
	}
	return s.rdb.Subscribe(ctx, channel)
}

func (s *Subscriber) Close() error {
	if s != nil && s.rdb != nil {
		return s.rdb.Close()
	}
	return nil
}

// NoopPublisher used when Redis not configured
type NoopPublisher struct{}

func (NoopPublisher) Publish(ctx context.Context, jobID uuid.UUID, output string, done bool) error {
	return nil
}

func (NoopPublisher) Close() error { return nil }
