from datetime import datetime
def on_config(config, **kwargs):
    config.copyright = f"&copy; {datetime.now().year} – Except where otherwise noted , content on this site is licensed under a <a href=\"https://creativecommons.org/licenses/by-sa/4.0/\" target=\"_blank\">Creative Commons Attribution-ShareAlike 4.0 International license</a>"