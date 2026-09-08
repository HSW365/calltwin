# CallTwin telephony migration

CallTwin's product architecture is now provider-neutral at the sales layer. The current backend still contains legacy Twilio call-engine code and MUST NOT be represented as Twilio-free production calling yet.

## Required production migration
1. Choose the replacement voice/telephony provider.
2. Implement inbound webhooks, outbound calling, speech recognition, audio playback/streaming, SMS, caller verification and number provisioning behind a provider adapter.
3. Keep the CallTwin conversation engine, lead model, billing and dashboard independent of that provider.
4. Store provider credentials only as deployment secrets; never in GitHub.
5. Run inbound, outbound, SMS, voicemail, transfer, opt-out and failure tests before moving paid customers.

The website intentionally does not promise a Twilio-only implementation. This prevents the Twilio suspension from defining the CallTwin product while the replacement carrier is finalized.
