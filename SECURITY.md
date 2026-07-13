# Security Policy

## Supported Version

Security fixes currently target the latest tagged release and the default branch.

## Reporting

Do not publish Wi-Fi credentials, printer addresses, Bluetooth device addresses, serial logs containing local identifiers, or unredacted diagnostic reports in a public issue.

For a vulnerability that could trigger a camera unexpectedly, bypass dry-run or armed gates, write unintended board files, or expose credentials, use GitHub's private security advisory flow for this repository. Include the affected version, hardware route, reproduction steps, and a redacted diagnostic report.

普通故障可以提交公开 issue，但请先使用配置器的“复制报告”；该报告会隐藏 Wi-Fi 密码、SSID、局域网 IPv4 和设备地址。涉及绕过安全闸门或泄露凭据的问题，请使用 GitHub 私密安全报告。

## Safety Boundary

The project cannot guarantee camera, printer, or electrical safety. Keep the board in dry-run while installing or diagnosing, verify generated G-code before printing, and provide a physical way to disconnect the shutter path.
