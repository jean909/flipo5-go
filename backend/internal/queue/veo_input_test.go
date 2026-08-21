package queue

import "testing"

func TestSnapVeoDuration(t *testing.T) {
	cases := map[int]int{0: 8, -1: 8, 1: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8, 15: 8}
	for in, want := range cases {
		if got := SnapVeoDuration(in); got != want {
			t.Fatalf("SnapVeoDuration(%d)=%d want %d", in, got, want)
		}
	}
}

func TestBuildVeoPredictionInputReferenceImages(t *testing.T) {
	in := buildVeoPredictionInput(map[string]interface{}{
		"prompt":           "cars racing",
		"duration":         float64(6),
		"aspect_ratio":     "9:16",
		"resolution":       "720p",
		"reference_images": []interface{}{"https://a.png", "https://b.png"},
	})
	if in["duration"] != 8 {
		t.Fatalf("duration=%v", in["duration"])
	}
	if in["aspect_ratio"] != "16:9" {
		t.Fatalf("aspect=%v", in["aspect_ratio"])
	}
	refs, ok := in["reference_images"].([]string)
	if !ok || len(refs) != 2 {
		t.Fatalf("refs=%v", in["reference_images"])
	}
	if _, ok := in["last_frame"]; ok {
		t.Fatal("last_frame should be omitted with reference_images")
	}
}

func TestBuildVeoPredictionInputSingleImage(t *testing.T) {
	in := buildVeoPredictionInput(map[string]interface{}{
		"prompt":   "animate",
		"duration": float64(4),
		"image":    "https://x.png",
	})
	if in["image"] != "https://x.png" {
		t.Fatalf("image=%v", in["image"])
	}
	if in["duration"] != 4 {
		t.Fatalf("duration=%v", in["duration"])
	}
}
