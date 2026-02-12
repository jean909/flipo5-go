package cache

import (
	"context"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const defaultTTL = 60 * time.Second

type Redis struct {
	client *redis.Client
	ttl    time.Duration
}

func NewRedis(redisURL string) (*Redis, error) {
	u := redisURL
	if u != "" && !strings.HasPrefix(u, "redis://") && !strings.HasPrefix(u, "rediss://") {
		u = "redis://" + u
	}
	opt, err := redis.ParseURL(u)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(opt)
	return &Redis{client: client, ttl: defaultTTL}, nil
}

func (r *Redis) Get(ctx context.Context, key string) ([]byte, error) {
	b, err := r.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	return b, err
}

func (r *Redis) Set(ctx context.Context, key string, val []byte) error {
	return r.client.Set(ctx, key, val, r.ttl).Err()
}

func (r *Redis) Delete(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	return r.client.Del(ctx, keys...).Err()
}

// DeleteByPrefix removes all keys matching pattern (e.g. "content:userID:").
func (r *Redis) DeleteByPrefix(ctx context.Context, prefix string) error {
	var cursor uint64
	for {
		keys, next, err := r.client.Scan(ctx, cursor, prefix+"*", 100).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			_ = r.client.Del(ctx, keys...).Err()
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return nil
}

func (r *Redis) Close() error {
	return r.client.Close()
}
