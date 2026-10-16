# User-facing API messages

Use stable message codes and parameters for new user-facing API errors, warnings,
and notices. Register English text in `source/server/utils/messages/catalogue.ts`
and add French text when available. Localize at the HTTP response boundary through
the shared helpers; background tasks and logs must not depend on a request language.

Keep legacy string responses working when migrating a feature. Preserve HTTP status
codes and readable English defaults. Test message codes and language negotiation
instead of hard-coding complete translated sentences into browser tests.

Migrate other response strings feature by feature through the same helpers. Keep
legacy task results readable and preserve protocol-defined machine identifiers.
