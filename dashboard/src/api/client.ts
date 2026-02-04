import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from "axios";

// Create axios instance with default configuration
const apiClient: AxiosInstance = axios.create({
  // Use relative URL in development to leverage Vite's proxy
  baseURL: import.meta.env.DEV
    ? ""
    : import.meta.env.VITE_API_URL || "http://localhost:3000",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for adding auth token or other headers
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Add authentication token if available
    // const token = localStorage.getItem('authToken');
    // if (token && config.headers) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor for handling common errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    // Handle common error scenarios
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // Unauthorized - redirect to login or refresh token
          console.error("Unauthorized access");
          break;
        case 403:
          // Forbidden - insufficient permissions
          console.error("Access forbidden");
          break;
        case 404:
          // Not found
          console.error("Resource not found");
          break;
        case 500:
          // Server error
          console.error("Server error");
          break;
        default:
          console.error(
            `API Error: ${status}`,
            data?.message || "Unknown error",
          );
      }
    } else if (error.request) {
      // Network error - server didn't respond
      console.error("Network error - no response received");
    } else {
      // Request configuration error
      console.error("Request configuration error:", error.message);
    }

    return Promise.reject(error);
  },
);

export default apiClient;
