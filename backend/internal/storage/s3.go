package storage

import (
	"context"
	"fmt"
	"io"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Config struct {
	Endpoint    string
	Region      string
	Bucket      string
	Key         string
	Secret      string
	UseSSL      bool
	PublicBaseURL string // optional: e.g. https://storage.flipo5.com for public read URLs
}

type Store struct {
	client       *s3.Client
	bucket       string
	publicBaseURL string
}

func NewS3(ctx context.Context, cfg S3Config) (*Store, error) {
	if cfg.Endpoint == "" {
		return nil, nil // storage optional for MVP
	}
	scheme := "https"
	if !cfg.UseSSL {
		scheme = "http"
	}
	endpoint := fmt.Sprintf("%s://%s", scheme, cfg.Endpoint)
	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, opts ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{URL: endpoint}, nil
	})
	creds := credentials.NewStaticCredentialsProvider(cfg.Key, cfg.Secret, "")
	c, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(cfg.Region),
		config.WithCredentialsProvider(creds),
		config.WithEndpointResolverWithOptions(customResolver),
	)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(c, func(o *s3.Options) {
		o.UsePathStyle = true
	})
	return &Store{client: client, bucket: cfg.Bucket, publicBaseURL: strings.TrimSuffix(cfg.PublicBaseURL, "/")}, nil
}

func (s *Store) Put(ctx context.Context, key string, body io.Reader, contentType string) (string, error) {
	if s == nil {
		return "", nil
	}
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        body,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}
	// URL: endpoint/bucket/key
	return path.Join(s.bucket, key), nil
}

// URL returns the public URL for a key. If PublicBaseURL is set (e.g. https://storage.flipo5.com), returns that + key; otherwise returns the key only.
func (s *Store) URL(key string) string {
	if s == nil {
		return ""
	}
	key = strings.TrimPrefix(key, "/")
	if s.publicBaseURL != "" {
		return s.publicBaseURL + "/" + key
	}
	return key
}
