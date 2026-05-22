select created_at, status, model, error_message
from ai_usage_log
where feature = 'practice'
order by created_at desc
limit 5;