# Install Muka with one prompt

Paste this into Claude Code on any computer. The same prompt installs Muka the first time and updates it later.

```text
Clone the public GitHub repo https://github.com/MulhamKassab/muka into the muka folder in my home folder (or git pull if it's already there), then install it by following its INSTALL.md.
```

Claude pulls the code, installs or updates the plugin from that folder, and then tells you to type `/reload-plugins`, `/muka setup` and `/muka`. The steps it follows are in [INSTALL.md](INSTALL.md).

The computer needs `git`. If it is missing, Claude stops and tells you.
