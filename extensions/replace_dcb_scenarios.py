import re
import markdown
import subprocess

class DCBScenarioReplacer(markdown.preprocessors.Preprocessor):
    def run(self, lines):
        updated_lines = []
        inside_script = False
        script_content = []

        for line in lines:
            if re.match(r'<script type="application/dcb\+json">', line):
                inside_script = True
                script_content = []
                continue  # Remove opening tag
            
            if inside_script:
                if re.match(r'</script>', line):
                    inside_script = False
                    try:
                        result = subprocess.run(
                            ['php', 'scripts/scenario-generator/render.php'],
                            input="\n".join(script_content),
                            text=True,
                            capture_output=True,
                            check=True
                        )
                        updated_lines.append(result.stdout.strip())
                    except subprocess.CalledProcessError as e:
                        print('Error executing PHP script:', e, e.stderr)
                        updated_lines.extend(script_content)
                    continue
                else:
                    script_content.append(line)
            else:
                updated_lines.append(line)

        return updated_lines

class DCBScenarioMarkdownExtension(markdown.Extension):
    def extendMarkdown(self, md):
        md.preprocessors.register(DCBScenarioReplacer(md), 'replace_dcb_scenarios', 175)

def makeExtension(**kwargs):
    return DCBScenarioMarkdownExtension(**kwargs)