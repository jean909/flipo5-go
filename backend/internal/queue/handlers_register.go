package queue

import (
	"github.com/hibiken/asynq"
)

func (h *Handlers) Register(mux *asynq.ServeMux) {
	mux.HandleFunc(TypeChat, h.ChatHandler)
	mux.HandleFunc(TypeImage, h.ImageHandler)
	mux.HandleFunc(TypeVideo, h.VideoHandler)
	mux.HandleFunc(TypeUpscale, h.UpscaleHandler)
	mux.HandleFunc(TypeSEO, h.SEOHandler)
	mux.HandleFunc(TypeOutline, h.OutlineHandler)
	mux.HandleFunc(TypeTranslate, h.TranslateHandler)
	mux.HandleFunc(TypeLogo, h.LogoHandler)
	mux.HandleFunc(TypeAudio, h.AudioHandler)
	mux.HandleFunc(TypeVectorize, h.VectorizeHandler)
	mux.HandleFunc(TypeProductScore, h.ProductScoreHandler)
	mux.HandleFunc(TypeProductDescription, h.ProductDescriptionHandler)
	mux.HandleFunc(TypeProductSceneImprove, h.ProductSceneImproveHandler)
	mux.HandleFunc(TypeSummarizeThread, h.SummarizeThreadHandler)
	mux.HandleFunc(TypeCancelStaleJobs, h.CancelStaleJobsHandler)
}
