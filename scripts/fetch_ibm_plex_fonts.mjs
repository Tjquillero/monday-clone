import fs from 'fs';
import path from 'path';

const fontsDir = path.resolve('public/fonts/ibm-plex');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

const fonts = [
  {
    name: 'IBMPlexSans-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf',
    weight: 400,
    family: 'IBM Plex Sans'
  },
  {
    name: 'IBMPlexSans-SemiBold.ttf',
    url: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDNF5zAA.ttf',
    weight: 600,
    family: 'IBM Plex Sans'
  },
  {
    name: 'IBMPlexSans-Bold.ttf',
    url: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDDV5zAA.ttf',
    weight: 700,
    family: 'IBM Plex Sans'
  },
  {
    name: 'IBMPlexMono-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf',
    weight: 400,
    family: 'IBM Plex Mono'
  },
  {
    name: 'IBMPlexMono-SemiBold.ttf',
    url: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3vAO8lc.ttf',
    weight: 600,
    family: 'IBM Plex Mono'
  }
];

async function run() {
  for (const f of fonts) {
    const res = await fetch(f.url);
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = path.join(fontsDir, f.name);
    fs.writeFileSync(dest, buf);
    console.log(`Saved ${f.name} (${buf.length} bytes) to ${dest}`);
  }
}

run();
