# Example Claude Desktop Configuration

This is an example configuration for using the Ancestry MCP Server with Claude Desktop.

## macOS Location
`~/Library/Application Support/Claude/claude_desktop_config.json`

## Windows Location
`%APPDATA%\Claude\claude_desktop_config.json`

## Configuration

```json
{
  "mcpServers": {
    "ancestry": {
      "command": "node",
      "args": [
        "/absolute/path/to/ancestry-mcp-server/index.js"
      ],
      "env": {
        "ANCESTRY_USERNAME": "your-email@example.com",
        "ANCESTRY_PASSWORD": "your-password-here"
      }
    }
  }
}
```

## Important Notes

1. Replace `/absolute/path/to/ancestry-mcp-server/index.js` with the actual path to the server
2. Replace credentials with your actual Ancestry.com login
3. Restart Claude Desktop after updating the config
4. Make sure you have run `npm install` in the server directory first

## Security Considerations

- The config file contains your credentials in plain text
- Keep the config file secure with appropriate file permissions
- Consider using environment variables instead if supported by your system
- Never commit this config file to version control

## Troubleshooting

If the server doesn't show up in Claude:
1. Check the config file path is correct
2. Verify the JSON syntax is valid
3. Ensure Node.js is installed and in PATH
4. Check Claude Desktop logs for errors
5. Verify the index.js path is absolute and correct
