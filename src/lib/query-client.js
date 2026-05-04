import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			staleTime: 2 * 60 * 1000,  // 2 minutos — evita re-fetches desnecessários
			gcTime: 10 * 60 * 1000,    // mantém dados no cache por 10 min após desmount
		},
	},
});