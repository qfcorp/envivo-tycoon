<?php $f=$argv[1];$d=new PDO('sqlite:'.$f);$d->setAttribute(3,2);
// Solo LEE una copia de la base y muestra rastros de la partida del jugador 1 (fama pública, vitrina, analítica). Uso: sudo php rescate_partida.php ARCHIVO.sqlite
function q($d,$s){try{return $d->query($s)->fetchAll(2);}catch(Exception $e){return 'ERR '.$e->getMessage();}}
echo "fama_publica: ";print_r(q($d,"SELECT fama_publica FROM jugadores WHERE id=1"));
echo "vitrina: ";$v=q($d,"SELECT partida_act,creado,datos FROM visitas_vitrinas WHERE jugador_id=1");if(is_array($v)&&$v){$x=json_decode($v[0]['datos'],true);echo date('Y-m-d H:i',$v[0]['creado'])." fama=".($x['fama']??'?')." dia=".($x['dia']??'?')."\n";}else print_r($v);
echo "partida: ";print_r(q($d,"SELECT rev,datetime(actualizado,'unixepoch','-5 hours') f,dispositivo FROM partidas WHERE jugador_id=1"));
echo "eventos con dia/fama:\n";$r=q($d,"SELECT datetime(t/1000,'unixepoch','-5 hours') f,nombre,substr(datos,1,160) d FROM eventos WHERE jugador_id=1 AND (datos LIKE '%dia%' OR datos LIKE '%fama%' OR datos LIKE '%day%' OR datos LIKE '%rep%') ORDER BY t DESC LIMIT 40");
if(is_array($r))foreach($r as $e)echo "$e[f] $e[nombre] $e[d]\n";else echo $r;
