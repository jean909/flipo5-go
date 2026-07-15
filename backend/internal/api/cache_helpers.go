package api

import (
	"context"

	"github.com/google/uuid"
)

func (s *Server) invalidateThreadCache(ctx context.Context, threadID, userID uuid.UUID) {
	if s.Cache == nil {
		return
	}
	keys := []string{
		"thread:" + userID.String() + ":" + threadID.String(),
		"threads:" + userID.String() + ":archived:false",
		"threads:" + userID.String() + ":archived:true",
	}
	_ = s.Cache.Delete(ctx, keys...)
}

func (s *Server) invalidateContentCache(ctx context.Context, userID uuid.UUID) {
	if s.Cache == nil {
		return
	}
	_ = s.Cache.DeleteByPrefix(ctx, "content:"+userID.String()+":")
}
