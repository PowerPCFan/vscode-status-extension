# vscode-status

A simple extension that sends your VSCode status to an external API \(https://github.com/PowerPCFan/vscode-status-api/\).

Extension Settings:
- API URL: The API endpoint to send status updates to
- Auth Token: Authentication token for API requests.
- Details Debugging: Custom string for the details section when debugging
- Details Editing: Custom string for the details section when editing
- Details Idling: Custom string for the details section when idling
- Enabled: Controls if VSCode Status should send updates to the API
- Idle Timeout: Time to stop sending updates when idling.
- Suppress Notifications: Stops error messages from being sent to the user when enabled
- User ID: User ID for tracking, updating, and receiving status updates to and from the API.

Notice: I know very little about developing Visual Studio Code extensions so I used Claude 4 Sonnet to make this extension with my API and some other VSCode extensions as a reference. I have tested the extension and refined it to my liking and it seems to work well.
