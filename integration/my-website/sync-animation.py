"""Update the existing About animation without replacing portfolio pages."""
from pathlib import Path
import re
import shutil
import tempfile

source = Path(__file__).resolve().parents[2] / 'dist'
website = Path('/Users/mandy/Documents/zx/my-website')
about = website / 'about.html'
controller = website / 'js/about-mandy.js'
html, js = about.read_text(), controller.read_text()
experience = list((source / 'assets').glob('experience-*.js'))
assert len(experience) == 1, 'Build the animation first.'
asset = experience[0].name
pattern = r'experience-[\w-]+\.js(?:\?[^\s\"\x27<>]*)?'
assert len(re.findall(pattern, html)) == len(re.findall(pattern, js)) == 1
html = re.sub(pattern, asset, html)
html = re.sub(r'js/about-mandy\.js(?:\?[^\s\"<>]*)?', f'js/about-mandy.js?v={experience[0].stem}', html)
js = re.sub(pattern, asset, js)
backup = Path(tempfile.mkdtemp(prefix='mandy-about-before-'))
shutil.copy2(about, backup / 'about.html')
shutil.copy2(controller, backup / 'about-mandy.js')
# Keep the standalone project's redirect and all portfolio content intact.
shutil.copytree(source / 'assets', website / 'little-mandy/assets', dirs_exist_ok=True)
for name in ['embed.html', 'mandy.glb', 'portrait.png']:
    target = website / 'little-mandy' / name
    if target.exists():
        shutil.copy2(target, backup / name)
    shutil.copy2(source / name, target)
about.write_text(html)
controller.write_text(js)
print(f'Updated About animation to {asset}. Backup: {backup}')
