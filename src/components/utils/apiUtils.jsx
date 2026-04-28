
export const retryWithBackoff = async (fn, retries = 3, delayMs = 2000, context = 'default') => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      const errorMsg = String(error.message || error || '');
      
      const isNetworkError = 
        errorMsg.includes("429") || 
        errorMsg.includes("Rate limit") ||
        errorMsg.includes("Too Many Requests") ||
        errorMsg.includes("500") ||
        errorMsg.includes("502") ||
        errorMsg.includes("503") ||
        errorMsg.includes("504") ||
        errorMsg.includes("Network Error") ||
        errorMsg.includes("Failed to fetch") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("ReplicaSetNoPrimary") ||
        error.name === 'NetworkError' ||
        error.code === 'NETWORK_ERROR' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT';
      
      const isRateLimit = errorMsg.includes("429") || errorMsg.includes("Rate limit") || errorMsg.includes("Too Many Requests");
      
      if (i === retries - 1 || !isNetworkError) {
        console.error(`❌ [${context}] Tentativa final falhou ou erro não recuperável:`, errorMsg);
        throw error;
      }
      
      let backoffDelay;
      
      if (isRateLimit) {
        backoffDelay = Math.min(120000, delayMs * Math.pow(4, i) + Math.random() * 10000); // Até 2 minutos
      } else {
        backoffDelay = delayMs * Math.pow(2, i) + Math.random() * 2000;
      }
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
};

export const retryWithExtendedBackoff = async (fn, context = 'default') => {
  const maxRetries = 5;
  const baseDelay = 5000; // 5 segundos iniciais
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const errorMsg = String(error.message || error || '');
      
      const isNetworkError = 
        errorMsg.includes("429") || 
        errorMsg.includes("Rate limit") ||
        errorMsg.includes("Too Many Requests") ||
        errorMsg.includes("500") ||
        errorMsg.includes("502") ||
        errorMsg.includes("503") ||
        errorMsg.includes("504") ||
        errorMsg.includes("Network Error") ||
        errorMsg.includes("Failed to fetch") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("ReplicaSetNoPrimary") ||
        error.name === 'NetworkError' ||
        error.code === 'NETWORK_ERROR' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT';
      
      const isRateLimit = errorMsg.includes("429") || errorMsg.includes("Rate limit") || errorMsg.includes("Too Many Requests");
      
      if (i === maxRetries - 1 || !isNetworkError) {
        console.error(`❌ [${context}] Tentativa final com backoff estendido falhou:`, errorMsg);
        throw error;
      }
      
      let backoffDelay;
      
      if (isRateLimit) {
        backoffDelay = Math.min(150000, baseDelay * Math.pow(5, i) + Math.random() * 15000); // Até 2.5 minutos
      } else {
        backoffDelay = baseDelay * Math.pow(2.5, i) + Math.random() * 3000;
      }
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
};

export const executeSequentialWithDelay = async (tasks, delayBetween = 1000) => {
  const results = [];
  for (let i = 0; i < tasks.length; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetween));
    }
    try {
      const result = await tasks[i]();
      results.push(result);
    } catch (error) {
      results.push(null);
    }
  }
  return results;
};

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
