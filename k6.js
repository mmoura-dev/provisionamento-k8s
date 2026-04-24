import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = "http://192.168.56.10"
const TOKEN = __ENV.JWT_TOKEN;

export const options = {
  scenarios: {
    ramping_rps: {
      executor: 'ramping-arrival-rate',
      startRate: 1,          // começa com 1 req/s
      timeUnit: '1s',
      preAllocatedVUs: 5,
      maxVUs: 20,
      stages: [
        { target: 1, duration: '60s' }, // mantém 1 rps
        { target: 2, duration: '60s' }, // sobe para 2 rps
        { target: 3, duration: '60s' },
      ],
    },
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/get`, {
    headers: {
      'Host': 'service-3.example.com',
      'Authorization': `Bearer ${TOKEN}`,
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
