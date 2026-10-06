"""Copy the built character and add the isolated homepage module, preserving other edits."""
from pathlib import Path
import shutil
import tempfile
import re

source = Path(__file__).resolve().parents[2]
website = Path('/Users/mandy/Documents/zx/my-website')
module = Path(__file__).resolve().parent
index = website / 'index.html'
html = index.read_text()
assert 'class="motion-opening"' in html and 'class="work-showcase"' in html, 'Homepage changed; inspect it before integrating.'
assert (source / 'dist/portrait.png').exists(), 'Build the portrait fallback first.'

# Replace only this module, including the first integration against the earlier opening.
html = re.sub(r'<section class="home-mandy-section".*?</section>\s*', '', html, flags=re.S)
html = re.sub(r'<article class="[^"]*showcase-slide--mandy[^"]*".*?</article>\s*', '', html, flags=re.S)
html = re.sub(r'<figure class="home-mandy".*?</figure>\s*', '', html, flags=re.S)
assert '<div class="swiper-wrapper">' in html, 'Carousel changed; inspect before integrating.'
html = html.replace('<div class="swiper-wrapper">', '<div class="swiper-wrapper">\n' + module.joinpath('home-mandy.html').read_text(), 1)
for number, name in enumerate(['grid1', 'walker', 'grid2', 'photo'], start=2):
    pattern = r'(<article class="swiper-slide showcase-slide showcase-slide--' + name + r'".*?</article>)'
    html = re.sub(pattern, lambda match: re.sub(r'(class="showcase-kicker">)\d{2}( /)', rf'\g<1>{number:02}\g<2>', match[0]), html, flags=re.S)
if 'css/home-mandy.css' not in html:
    html = html.replace('</head>', '<link rel="stylesheet" href="css/home-mandy.css?v=1"><script src="js/home-mandy.js?v=1" defer></script></head>', 1)
for asset in ['css/home-mandy.css', 'js/home-mandy.js', 'js/home-showcase.js']:
    html = re.sub(re.escape(asset) + r'(?:\?[^"\s]*)?', asset + '?v=mandy-first-2', html)

carousel = website / 'js/home-showcase.js'
carousel_js = carousel.read_text()
old_titles = "const titles = ['Grid 1', 'Walker', 'Grid 2', 'Photography'];"
new_titles = "const titles = ['Little Mandy', 'Grid 1', 'Walker', 'Grid 2', 'Photography'];"
assert old_titles in carousel_js or new_titles in carousel_js, 'Carousel labels changed; inspect before integrating.'
carousel_js = carousel_js.replace(old_titles, new_titles)

backup = Path(tempfile.mkdtemp(prefix='mandy-home-before-'))
shutil.copy2(index, backup / 'index.html')
shutil.copy2(carousel, backup / 'home-showcase.js')
for name, directory in [('home-mandy.css', 'css'), ('home-mandy.js', 'js')]:
    shutil.copy2(module / name, website / directory / name)
shutil.copytree(source / 'dist', website / 'little-mandy', dirs_exist_ok=True)
carousel.write_text(carousel_js)
index.write_text(html)
print(f'Integrated homepage character. Previous homepage saved at {backup}.')
