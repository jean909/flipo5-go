package store

import "strings"

// JobTypes is the canonical list of persisted job.type values.
var JobTypes = []string{
	"chat", "image", "video", "upscale", "seo", "outline", "translate", "logo",
	"product_analyze", "product_score", "product_description", "product_scene_improve",
	"product_suggest_scenes", "audio", "vectorize",
}

// JobTypesInClause returns a SQL IN (...) fragment for migrations.
func JobTypesInClause() string {
	parts := make([]string, len(JobTypes))
	for i, t := range JobTypes {
		parts[i] = "'" + t + "'"
	}
	return strings.Join(parts, ", ")
}
