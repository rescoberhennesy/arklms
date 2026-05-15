SELECT feature, status, error_message, model, input_tokens, output_tokens, created_at
FROM ai_usage_log
WHERE feature = 'flashcards'
ORDER BY created_at DESC
LIMIT 3;