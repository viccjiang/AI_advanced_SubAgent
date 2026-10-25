const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const orders = ref([]);
    const loading = ref(true);
    const loadingMore = ref(false);
    const pagination = ref(null);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    // API returns one page at a time; append the next page on demand
    async function fetchPage(page) {
      const res = await apiFetch('/api/orders?page=' + page);
      orders.value = orders.value.concat(res.data.orders);
      pagination.value = res.data.pagination;
    }

    function hasMore() {
      return pagination.value && pagination.value.page < pagination.value.totalPages;
    }

    async function loadMore() {
      if (!hasMore() || loadingMore.value) return;
      loadingMore.value = true;
      try {
        await fetchPage(pagination.value.page + 1);
      } catch (e) {
        // keep the orders already shown
      } finally {
        loadingMore.value = false;
      }
    }

    onMounted(async function () {
      try {
        await fetchPage(1);
      } catch (e) {
        orders.value = [];
      } finally {
        loading.value = false;
      }
    });

    return { orders, loading, loadingMore, statusMap, formatDate, hasMore, loadMore };
  }
}).mount('#app');
