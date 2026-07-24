import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || '/api';

const adminApi = axios.create({
  baseURL: `${BASE_URL}/admin`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

export default adminApi;
