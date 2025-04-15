from datetime import datetime
def on_config(config, **kwargs):
    config.copyright = f"Copyright &copy; {datetime.now().year} – <a href=\"/about/\">This site is maintained with passion and commitment by a community of DCB enthusiasts</a>"