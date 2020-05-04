import http from 'k6/http';
import { sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 2000 },
    { duration: '180s', target: 3000 },
  ],
};

export default function() {
  http.get('http://web:3500/web/80/1');
  sleep(1);
}
