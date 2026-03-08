# Changelog

All notable user-facing changes in this project should be recorded here.

## 0.0.11 - 2026-03-08

- Fixed cron model selection so new jobs default to the current primary model instead of an ambiguous empty value.
- Clarified the cron UI between “follow primary model” and “pin to a specific model”.
- Added Manager-side clearing of stored cron model overrides when an existing job is switched back to “follow primary model”.

## 0.0.10 - 2026-03-08

- Added one-way notification channels for scheduled tasks, with Feishu and DingTalk webhook support in the Manager settings.
- Added per-job notification options in Cron editing, including separate success/failure toggles.
- Added a Manager-side cron monitor that can send summary notifications after jobs finish, without turning the target channel into a chat session.
- Added planned placeholders for SMS and phone notifications, while keeping them clearly marked as not yet implemented.

## 0.0.8 - 2026-03-07

- Added a simple versioning workflow with synchronized app version files.
- Renamed the product display name to `🦞 龙虾 OpenClaw Manager 小白版`.
- Reworked the README into separate Chinese and English guides with clearer beginner-facing structure.
- Added an explicit explanation of how this version differs from the original project.

## 0.0.7

- Previous baseline before the beginner-edition versioning workflow.
