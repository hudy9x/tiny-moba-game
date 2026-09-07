import { gameConfig } from './gameConfig.js';
/** Reward eliminations and actual damage, penalize deaths; stable ties across clients. */
export function selectMvp(players, config = gameConfig.match.mvp) {
  const ranked = [...players].map(p => ({id:p.id,name:p.name,kills:p.kills,deaths:p.deaths,damageDealt:p.damageDealt || 0,
    score:p.kills*config.killWeight+(p.damageDealt || 0)*config.damageWeight-p.deaths*config.deathPenalty}));
  ranked.sort((a,b)=>b.score-a.score || b.kills-a.kills || a.deaths-b.deaths || b.damageDealt-a.damageDealt || a.id.localeCompare(b.id));
  return ranked[0] || null;
}
