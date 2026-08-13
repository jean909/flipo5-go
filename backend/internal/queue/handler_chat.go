package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"flipo5/backend/internal/documents"
	"flipo5/backend/internal/intent"
	"flipo5/backend/internal/textmodel"

	"github.com/hibiken/asynq"
	repgo "github.com/replicate/replicate-go"
)

func (h *Handlers) ChatHandler(ctx context.Context, t *asynq.Task) error {
	var p ChatPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, "")
	if h.Repl == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "Replicate not configured", 0, "")
		return nil
	}
	model := h.Cfg.ModelText
	if model == "" {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "REPLICATE_MODEL_TEXT not set", 0, "")
		return nil
	}
	job, err := h.DB.GetJob(ctx, p.JobID)
	if err != nil || job == nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, "job not found", 0, "")
		return nil
	}

	var jobInput map[string]interface{}
	if len(job.Input) > 0 {
		_ = json.Unmarshal(job.Input, &jobInput)
	}
	if jobInput == nil {
		jobInput = map[string]interface{}{}
	}
	prompt := p.Prompt
	if prompt == "" {
		if s, ok := jobInput["prompt"].(string); ok {
			prompt = s
		}
	}

	u, _ := h.DB.UserByID(ctx, job.UserID)
	userName := ""
	if u != nil && strings.TrimSpace(u.FullName) != "" {
		userName = strings.TrimSpace(u.FullName)
		if idx := strings.Index(userName, " "); idx > 0 {
			userName = userName[:idx]
		}
	}
	// Build model input (Claude Fable or legacy Gemini).
	system := `You are Flipo5, an AI assistant trained by Moise I. Jean.

CRITICAL — first line (backend only, never discuss it with the user):
Line 1 of EVERY reply MUST be exactly one of these tags and nothing else on that line:
[[skill:chat]]
[[skill:image]]
[[skill:video]]
[[skill:image_edit]]
[[skill:remove_bg]]
Then a newline, then your normal user-facing reply.

How to choose the skill:
- [[skill:image]] — user wants a NEW picture/photo generated (any language: "generează o poză", "make an image", "zeichne", "fă-mi o poză", etc.)
- [[skill:video]] — user wants a NEW short video/clip (optionally from an attached or previous image: "animă poza", "make a video from this", "these cars"). Duration 1–15s if the user names one (e.g. "10 seconds").
- [[skill:remove_bg]] — user wants to REMOVE/CUT OUT the background of an existing photo (attached or previous): "remove background", "scoate fundalul", "fără fundal", "transparent background", "Hintergrund entfernen". Prefer this over image_edit when the request is specifically about background removal.
- [[skill:image_edit]] — user wants to edit/change an existing photo in other ways (style, objects, colors, etc.) — NOT pure background removal
- [[skill:chat]] — questions, advice, conversation, analysis (no media creation)

After the skill line:
- For [[skill:image]] or [[skill:video]]: write 1 short sentence confirming you are generating (match user language). Do NOT invent that the image already exists. Do NOT mention Midjourney/DALL·E. Do NOT explain the skill tag.
- For [[skill:remove_bg]] or [[skill:image_edit]]: if no photo is available in context, ask them to attach one; otherwise confirm briefly that you are processing it.
- For [[skill:chat]]: answer normally.

Identity:
- Never introduce yourself unless the user explicitly asks who you are.
- Stay on topic; do not repeat your identity.

Voice and style:
- Sound like a knowledgeable, friendly human. Natural conversational language.
- Match the user's language and register (casual ↔ formal).
- Be concise by default (1–3 sentences for simple asks).
- Skip filler ("Great question!", "I'd be happy to help").
- Never claim you cannot create images/videos.`
	if userName != "" {
		system += "\n\nThe user's name is " + userName + ". Use it naturally when appropriate (e.g. when greeting or closing)."
	}
	// Apply user AI configuration
	if u != nil && u.AIConfiguration != nil {
		if style, _ := u.AIConfiguration["style"].(string); style != "" {
			switch style {
			case "balanced":
				system += "\n\nTone preset: Balanced. Calibrate length to the question - short for simple, thorough for complex. Natural, human tone."
			case "friendly":
				system += "\n\nTone preset: Friendly. Warm and supportive, but still concise. Avoid over-enthusiasm."
			case "direct":
				system += "\n\nTone preset: Direct. No pleasantries, no filler. Answer in the fewest words that cover the question."
			case "logical":
				system += "\n\nTone preset: Logical. Structured, analytical. Use brief bullets or numbered steps only when they improve clarity."
			case "brief":
				system += "\n\nTone preset: Brief. Maximum 1-3 sentences unless absolutely necessary. No lists, no headings."
			case "detailed":
				system += "\n\nTone preset: Detailed. Give thorough context, examples, and edge cases. Structure with sections when useful."
			}
		}
		if lang, _ := u.AIConfiguration["primary_language"].(string); lang != "" && lang != "browser" {
			langMap := map[string]string{"en": "English", "de": "German", "ro": "Romanian", "fr": "French", "es": "Spanish", "it": "Italian"}
			if l, ok := langMap[lang]; ok {
				system += "\n\nPrimary response language: " + l + ". Respond in " + l + " unless the user asks in another language."
			}
		}
		if details, _ := u.AIConfiguration["user_details"].(string); strings.TrimSpace(details) != "" {
			system += "\n\nContext about the user (use naturally in your responses): " + strings.TrimSpace(details)
		}
	}

	// Chat project files: images → vision; PDFs/docs → server-side text extraction for Claude.
	var projectImageURLs []string
	var projectDocTexts []string
	if job.ThreadID != nil {
		if pid, _ := h.DB.GetThreadProjectID(ctx, *job.ThreadID); pid != nil {
			if proj, _ := h.DB.GetChatProject(ctx, *pid, job.UserID); proj != nil {
				if strings.TrimSpace(proj.Instructions) != "" {
					system += "\n\nProject instructions (apply to every reply in this conversation): " + strings.TrimSpace(proj.Instructions)
				}
				if files, _ := h.DB.ListChatProjectFiles(ctx, *pid, job.UserID); len(files) > 0 {
					ragDocs := make([]struct{ Name, Text string }, 0, len(files))
					for _, f := range files {
						fileURL := resolveMediaURL(h, f.FileURL)
						name := f.FileName
						if name == "" {
							name = filenameFromURL(fileURL)
						}
						if strings.HasPrefix(f.ContentType, "image/") {
							if fileURL != "" {
								projectImageURLs = append(projectImageURLs, fileURL)
							}
							text := strings.TrimSpace(f.ExtractedText)
							if text == "" {
								text = strings.TrimSpace(f.Summary)
							}
							if text != "" {
								ragDocs = append(ragDocs, struct{ Name, Text string }{name, text})
							}
						} else if documents.IsDocumentContentType(f.ContentType) || strings.HasSuffix(strings.ToLower(name), ".pdf") {
							fetchCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
							text, err := h.fetchDocumentText(fetchCtx, job.UserID, fileURL, f.ContentType, name, f.ExtractedText)
							cancel()
							if err == nil && strings.TrimSpace(text) != "" {
								projectDocTexts = append(projectDocTexts, fmt.Sprintf("### %s\n%s", name, text))
								ragDocs = append(ragDocs, struct{ Name, Text string }{name, text})
							} else if err != nil {
								log.Printf("[ChatHandler] project doc extract %s: %v", name, err)
							} else if strings.TrimSpace(f.Summary) != "" {
								ragDocs = append(ragDocs, struct{ Name, Text string }{name, f.Summary})
							}
						}
					}
					if hits := documents.SearchText(p.Prompt, ragDocs); len(hits) > 0 {
						var ragParts []string
						for _, hit := range hits {
							ragParts = append(ragParts, fmt.Sprintf("[%s] %s", hit.FileName, hit.Snippet))
						}
						system += "\n\nRelevant project excerpts for this question:\n" + strings.Join(ragParts, "\n")
					}
					if len(projectImageURLs) > 0 {
						system += "\n\nThe user attached project reference images to this conversation. Look at them, remember them across turns, and ground your answers in what they show."
					}
					if len(projectDocTexts) > 0 {
						system += "\n\nProject reference documents (extracted text — use as source of truth):\n\n" + strings.Join(projectDocTexts, "\n\n")
					}
				}
			}
		}
	}

	// Build Claude / Gemini input from system + conversation + user message
	contextBlock := buildChatContext(h.DB, ctx, job.ThreadID, job.UserID, p.JobID)
	userPrompt := p.Prompt
	if contextBlock != "" {
		userPrompt = contextBlock + "\n\nUser: " + p.Prompt
	} else {
		userPrompt = "User: " + p.Prompt
	}
	// Vision model accepts images only; PDFs/docs are text-extracted server-side and appended to the prompt.
	images := make([]string, 0, len(projectImageURLs)+4)
	var attachmentDocSections []string
	images = append(images, projectImageURLs...)
	if attachmentURLs, attachmentTypes := parseJobAttachmentInput(jobInput); len(attachmentURLs) > 0 {
		for i, urlStr := range attachmentURLs {
			urlStr = resolveMediaURL(h, urlStr)
			contentType := ""
			if i < len(attachmentTypes) {
				contentType = attachmentTypes[i]
			}
			if strings.HasPrefix(contentType, "image/") || (contentType == "" && isLikelyImageURL(urlStr)) {
				images = append(images, urlStr)
				continue
			}
			if documents.IsDocumentContentType(contentType) || strings.HasSuffix(strings.ToLower(filenameFromURL(urlStr)), ".pdf") || strings.HasSuffix(strings.ToLower(filenameFromURL(urlStr)), ".txt") {
				name := filenameFromURL(urlStr)
				fetchCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
				text, err := h.fetchDocumentText(fetchCtx, job.UserID, urlStr, contentType, name, "")
				cancel()
				if err == nil && strings.TrimSpace(text) != "" {
					attachmentDocSections = append(attachmentDocSections, fmt.Sprintf("### %s\n%s", name, text))
				} else {
					log.Printf("[ChatHandler] attachment extract %s: %v", name, err)
					if err != nil {
						attachmentDocSections = append(attachmentDocSections, fmt.Sprintf("### %s\n[Could not read this file: %v]", name, err))
					}
				}
				continue
			}
			if contentType != "" && !strings.HasPrefix(contentType, "image/") {
				attachmentDocSections = append(attachmentDocSections, fmt.Sprintf("### %s\n[Unsupported document type %s — paste text or upload PDF/TXT]", filenameFromURL(urlStr), contentType))
			}
		}
	}
	if len(attachmentDocSections) > 0 {
		userPrompt += "\n\nAttached documents (extracted text — answer using this content):\n\n" + strings.Join(attachmentDocSections, "\n\n")
	}
	input := textmodel.BuildInput(model, system, userPrompt, images, textmodel.DefaultMaxTokens)
	// Prefer streaming: create prediction with stream, then consume stream and update job output per chunk
	pred, err := h.Repl.CreatePredictionWithStreamFallback(ctx, model, h.textFallbacks(), input)
	if err != nil {
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, jobErrorMsg(err), 0, "")
		if h.Stream != nil {
			errMsg := jobErrorMsg(err)
			_ = h.Stream.Publish(ctx, p.JobID, fmt.Sprintf(`{"status":"failed","error":"%s"}`, errMsg), true)
		}
		return err
	}
	_ = h.DB.UpdateJobStatus(ctx, p.JobID, "running", nil, "", 0, pred.ID)
	streamURL := ""
	if pred.URLs != nil {
		streamURL = pred.URLs["stream"]
	}
	if streamURL != "" {
		filter := newSkillStreamFilter()
		var lastDBWrite time.Time
		lastDBLen := 0
		h.Repl.StreamOutput(ctx, streamURL, func(text string) {
			visibleChunk := filter.Push(text)
			if visibleChunk == "" {
				return
			}
			out := filter.Visible()
			now := time.Now()
			if now.Sub(lastDBWrite) >= 400*time.Millisecond || len(out)-lastDBLen >= 400 {
				lastDBWrite = now
				lastDBLen = len(out)
				_ = h.DB.UpdateJobOutput(ctx, p.JobID, map[string]interface{}{"output": out})
			}
			if h.Stream != nil {
				_ = h.Stream.Publish(ctx, p.JobID, out, false)
			}
		}, func() {})
		// Use GetPrediction final output - Replicate returns complete output; stream can lose chunks
		finalOutput := filter.Visible()
		detectedSkill := filter.Skill()
		var lastPred *repgo.Prediction
		for i := 0; i < 5; i++ {
			select {
			case <-ctx.Done():
				_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
				return nil
			default:
			}
			predState, err := h.Repl.GetPrediction(ctx, pred.ID)
			if err != nil {
				if i < 4 {
					time.Sleep(500 * time.Millisecond)
				}
				continue
			}
			lastPred = predState
			if predState.Status == "failed" || predState.Status == "canceled" {
				_ = h.Repl.CancelPrediction(ctx, pred.ID)
				errMsg := ""
				if predState.Error != nil {
					if s, ok := predState.Error.(string); ok {
						errMsg = s
					} else {
						errMsg = fmt.Sprintf("%v", predState.Error)
					}
				}
				if errMsg == "" {
					errMsg = "Prediction failed"
				}
				_ = h.DB.UpdateJobStatus(ctx, p.JobID, "failed", nil, errMsg, 0, pred.ID)
				return nil
			}
			if predState.Status != "succeeded" {
				if i < 4 {
					time.Sleep(500 * time.Millisecond)
				}
				continue
			}
			if out := normalizeChatOutput(predState.Output); out != nil {
				if m, ok := out.(map[string]interface{}); ok {
					if s, _ := m["output"].(string); s != "" {
						sk, body := SplitSkillHeader(s)
						detectedSkill = sk
						finalOutput = body
					}
				}
			}
			break
		}
		if lastPred != nil && (lastPred.Status == "failed" || lastPred.Status == "canceled") {
			return nil // already updated above
		}
		// Ensure header stripped even if we only had the stream accumulator.
		if sk, body := SplitSkillHeader(finalOutput); body != finalOutput || sk != intent.SkillChat {
			// If filter already stripped, SplitSkillHeader on visible body stays chat + body.
			if strings.HasPrefix(strings.TrimSpace(finalOutput), "[[skill:") || strings.HasPrefix(strings.TrimSpace(finalOutput), "[skill:") {
				detectedSkill = sk
				finalOutput = body
			}
		}
		spawnedID, mediaType := h.applyDetectedSkill(ctx, p.JobID, prompt, jobInput, job.ThreadID, job.UserID, detectedSkill)
		final := map[string]interface{}{"output": finalOutput, "detected_skill": string(detectedSkill)}
		if spawnedID != nil {
			final["spawned_job_id"] = spawnedID.String()
			final["spawned_job_type"] = mediaType
		}
		_ = h.DB.UpdateJobStatus(ctx, p.JobID, "completed", final, "", 0, pred.ID)
		if h.Stream != nil {
			_ = h.Stream.Publish(ctx, p.JobID, finalOutput, true)
			userJobsChannel := fmt.Sprintf("user:%s:jobs", job.UserID.String())
			updateMsg := fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"chat"}`, p.JobID.String())
			if spawnedID != nil {
				updateMsg = fmt.Sprintf(`{"jobId":"%s","status":"completed","type":"chat","spawned_job_id":"%s","spawned_job_type":"%s"}`,
					p.JobID.String(), spawnedID.String(), mediaType)
			}
			_ = h.Stream.PublishRaw(ctx, userJobsChannel, updateMsg)
		}
		h.invalidateJobCaches(ctx, job)
	} else {
		// Fallback: model doesn't support stream; poll until done
		jobID := p.JobID
		for {
			select {
			case <-ctx.Done():
				_ = h.Repl.CancelPrediction(context.Background(), pred.ID)
				_ = h.DB.UpdateJobStatus(ctx, jobID, "failed", nil, ErrMsgServerUnavailable, 0, pred.ID)
				return nil
			default:
			}
			predState, err := h.Repl.GetPrediction(ctx, pred.ID)
			if err != nil {
				_ = h.DB.UpdateJobStatus(ctx, jobID, "failed", nil, jobErrorMsg(err), 0, pred.ID)
				return err
			}
			switch predState.Status {
			case "succeeded":
				normalized := normalizeChatOutput(predState.Output)
				detectedSkill := intent.SkillChat
				visible := ""
				if m, ok := normalized.(map[string]interface{}); ok {
					if s, _ := m["output"].(string); s != "" {
						sk, body := SplitSkillHeader(s)
						detectedSkill = sk
						visible = body
						m["output"] = visible
						m["detected_skill"] = string(detectedSkill)
						normalized = m
					}
				}
				spawnedID, mediaType := h.applyDetectedSkill(ctx, jobID, prompt, jobInput, job.ThreadID, job.UserID, detectedSkill)
				if m, ok := normalized.(map[string]interface{}); ok && spawnedID != nil {
					m["spawned_job_id"] = spawnedID.String()
					m["spawned_job_type"] = mediaType
					normalized = m
				}
				_ = h.DB.UpdateJobStatus(ctx, jobID, "completed", normalized, "", 0, pred.ID)
				if h.Stream != nil && visible != "" {
					_ = h.Stream.Publish(ctx, jobID, visible, true)
				}
				goto done
			case "failed", "canceled":
				_ = h.Repl.CancelPrediction(ctx, pred.ID)
				errMsg := ""
				if predState.Error != nil {
					if s, ok := predState.Error.(string); ok {
						errMsg = s
					}
				}
				_ = h.DB.UpdateJobStatus(ctx, jobID, "failed", nil, errMsg, 0, pred.ID)
				return nil
			}
			time.Sleep(2 * time.Second)
		}
	done:
	}
	if job.ThreadID != nil && h.Asynq != nil {
		if task, err := NewSummarizeThreadTask(*job.ThreadID); err == nil {
			_, _ = h.Asynq.Enqueue(task, asynq.Queue("default"), asynq.ProcessIn(90*time.Second), asynq.Unique(2*time.Minute))
		}
	}
	return nil
}

func normalizeChatOutput(out repgo.PredictionOutput) repgo.PredictionOutput {
	normalized := map[string]interface{}{"output": ""}
	if out == nil {
		return normalized
	}
	// replicate-go returns prediction.Output directly: can be []interface{} (Gemini stream) or string
	if arr, ok := out.([]interface{}); ok {
		var parts []string
		for _, v := range arr {
			if s, ok := v.(string); ok {
				parts = append(parts, s)
			}
		}
		normalized["output"] = strings.Join(parts, "")
		return normalized
	}
	if s, ok := out.(string); ok {
		normalized["output"] = s
		return normalized
	}
	// Fallback: full prediction object with "output" key
	outBytes, _ := json.Marshal(out)
	var raw map[string]interface{}
	if err := json.Unmarshal(outBytes, &raw); err != nil {
		return normalized
	}
	if arr, ok := raw["output"].([]interface{}); ok {
		var parts []string
		for _, v := range arr {
			if s, ok := v.(string); ok {
				parts = append(parts, s)
			}
		}
		normalized["output"] = strings.Join(parts, "")
		return normalized
	}
	if s, ok := raw["output"].(string); ok {
		normalized["output"] = s
		return normalized
	}
	return normalized
}
