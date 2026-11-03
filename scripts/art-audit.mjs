// 素材对账：权威清单来自代码档案 MOB_DEFS(16) / BOSS_DEFS(10)；
// 校验 public/art/mobs、public/art/bosses 下文件齐全、为合法 JPEG、体积达标、无孤儿文件。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECT = {
  mobs: ['moss_slime','thorncap','ember_newt','flame_imp','bubble_fish','tide_crab','glow_wisp','prism_sprite','shade_bat','night_wraith','pebble_golem','rock_boar','gale_chick','storm_imp','frost_pup','aurora_wolf'],
  bosses: ['slime_king','caramel_fox','tide_lord','honey_bear','moon_demon','cloud_whale','magma_drake','star_beast','prism_queen','peak_titan']
};

let bad = 0;
for (const [sub, ids] of Object.entries(EXPECT)) {
  const dir = path.join(root, 'public', 'art', sub);
  const have = new Set(fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.jpg')) : []);
  for (const id of ids) {
    const f = id + '.jpg';
    if (!have.has(f)) { console.log(`MISSING ${sub}/${f}`); bad++; continue; }
    const buf = fs.readFileSync(path.join(dir, f));
    const magicOk = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    if (!magicOk) { console.log(`BADMAGIC ${sub}/${f}`); bad++; }
    else if (buf.length < 6000) { console.log(`SMALL ${sub}/${f} ${buf.length}B`); bad++; }
    have.delete(f);
  }
  for (const orphan of have) console.log(`ORPHAN ${sub}/${orphan}`);
  console.log(`[${sub}] expected=${ids.length} on-disk=${fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.jpg')).length:0}`);
}
if (bad) { console.log('ART AUDIT: FAIL(' + bad + ')'); process.exit(1); }
console.log('ART AUDIT: OK');
