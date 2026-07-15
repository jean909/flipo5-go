package queue

// parseJobAttachmentInput reads attachment_urls and attachment_content_types from job input JSON.
func parseJobAttachmentInput(jobInput map[string]interface{}) (urls, contentTypes []string) {
	rawURLs, ok := jobInput["attachment_urls"].([]interface{})
	if !ok || len(rawURLs) == 0 {
		return nil, nil
	}
	rawTypes, _ := jobInput["attachment_content_types"].([]interface{})
	for i, u := range rawURLs {
		urlStr, ok := u.(string)
		if !ok || urlStr == "" {
			continue
		}
		urls = append(urls, urlStr)
		if i < len(rawTypes) {
			if ct, ok := rawTypes[i].(string); ok {
				contentTypes = append(contentTypes, ct)
			} else {
				contentTypes = append(contentTypes, "")
			}
		} else {
			contentTypes = append(contentTypes, "")
		}
	}
	return urls, contentTypes
}
