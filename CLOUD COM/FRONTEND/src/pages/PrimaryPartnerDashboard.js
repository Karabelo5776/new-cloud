import React, { useState, useEffect } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';
import { useNavigate } from 'react-router-dom';

Chart.register(...registerables);

const PrimaryPartnerDashboard = () => {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState({
    financial: {
      monthly: { revenue: 0, expenses: 0, profit: 0 },
      yearly: { revenue: 0, expenses: 0, profit: 0 }
    },
    recentSales: [],
    inventory: [],
    loading: {
      financial: true,
      sales: true,
      inventory: true
    },
    error: {
      financial: null,
      sales: null,
      inventory: null
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const fetchDashboardData = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setDashboardData(prev => ({
        ...prev,
        error: {
          financial: 'No authentication token',
          sales: 'No authentication token',
          inventory: 'No authentication token'
        },
        loading: {
          financial: false,
          sales: false,
          inventory: false
        }
      }));
      return;
    }

    try {
      // Fetch all data in parallel
      const [financialRes, salesRes, inventoryRes] = await Promise.all([
        fetch('http://localhost:5000/primary-partner/financial-summary', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch('http://localhost:5000/primary-partner/recent-sales', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch('http://localhost:5000/primary-partner/inventory-status', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ]);

      // Process responses
      const financialData = financialRes.ok ? await financialRes.json() : null;
      const salesData = salesRes.ok ? await salesRes.json() : null;
      const inventoryData = inventoryRes.ok ? await inventoryRes.json() : null;

      setDashboardData(prev => ({
        ...prev,
        financial: financialData || prev.financial,
        recentSales: salesData || prev.recentSales,
        inventory: inventoryData || prev.inventory,
        loading: {
          financial: false,
          sales: false,
          inventory: false
        },
        error: {
          financial: financialRes.ok ? null : 'Failed to load financial data',
          sales: salesRes.ok ? null : 'Failed to load sales data',
          inventory: inventoryRes.ok ? null : 'Failed to load inventory data'
        }
      }));
    } catch (err) {
      console.error('Dashboard data fetch error:', err);
      setDashboardData(prev => ({
        ...prev,
        loading: {
          financial: false,
          sales: false,
          inventory: false
        },
        error: {
          financial: err.message,
          sales: err.message,
          inventory: err.message
        }
      }));
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatCurrency = (value) => {
    return 'M' + (Number(value) || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Chart data configurations
  const financialChartData = {
    labels: ['Monthly Revenue', 'Monthly Expenses', 'Monthly Profit'],
    datasets: [{
      label: 'Current Month',
      data: [
        dashboardData.financial.monthly.revenue,
        dashboardData.financial.monthly.expenses,
        dashboardData.financial.monthly.profit
      ],
      backgroundColor: [
        'rgba(54, 162, 235, 0.6)',
        'rgba(255, 99, 132, 0.6)',
        'rgba(75, 192, 192, 0.6)'
      ],
      borderColor: [
        'rgba(54, 162, 235, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(75, 192, 192, 1)'
      ],
      borderWidth: 1
    }]
  };

  const salesChartData = {
    labels: dashboardData.recentSales.map(sale => sale.product_name || `Sale #${sale.id}`),
    datasets: [{
      label: 'Sales Amount (M)',
      data: dashboardData.recentSales.map(sale => sale.total_price),
      backgroundColor: 'rgba(153, 102, 255, 0.6)',
      borderColor: 'rgba(153, 102, 255, 1)',
      borderWidth: 1
    }]
  };

  const inventoryChartData = {
    labels: dashboardData.inventory.map(item => item.name),
    datasets: [{
      label: 'Stock Quantity',
      data: dashboardData.inventory.map(item => item.quantity),
      backgroundColor: 'rgba(255, 159, 64, 0.6)',
      borderColor: 'rgba(255, 159, 64, 1)',
      borderWidth: 1
    }]
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Primary Partner Dashboard</h2>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>

      {/* Financial Overview Section */}
      <div className="dashboard-section">
        <h3>Financial Overview</h3>
        {dashboardData.loading.financial ? (
          <div className="loading">Loading financial data...</div>
        ) : dashboardData.error.financial ? (
          <div className="error">{dashboardData.error.financial}</div>
        ) : (
          <div className="financial-content">
            <div className="financial-tables">
              <div className="financial-table">
                <h4>Current Month</h4>
                <table>
                  <tbody>
                    <tr>
                      <td>Revenue:</td>
                      <td>{formatCurrency(dashboardData.financial.monthly.revenue)}</td>
                    </tr>
                    <tr>
                      <td>Expenses:</td>
                      <td>{formatCurrency(dashboardData.financial.monthly.expenses)}</td>
                    </tr>
                    <tr>
                      <td>Profit:</td>
                      <td>{formatCurrency(dashboardData.financial.monthly.profit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="financial-table">
                <h4>Year to Date</h4>
                <table>
                  <tbody>
                    <tr>
                      <td>Revenue:</td>
                      <td>{formatCurrency(dashboardData.financial.yearly.revenue)}</td>
                    </tr>
                    <tr>
                      <td>Expenses:</td>
                      <td>{formatCurrency(dashboardData.financial.yearly.expenses)}</td>
                    </tr>
                    <tr>
                      <td>Profit:</td>
                      <td>{formatCurrency(dashboardData.financial.yearly.profit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="financial-chart">
              <Pie data={financialChartData} />
            </div>
          </div>
        )}
      </div>

      {/* Recent Sales Section */}
      <div className="dashboard-section">
        <h3>Recent Sales</h3>
        {dashboardData.loading.sales ? (
          <div className="loading">Loading sales data...</div>
        ) : dashboardData.error.sales ? (
          <div className="error">{dashboardData.error.sales}</div>
        ) : (
          <div className="sales-content">
            <div className="sales-chart">
              <Bar data={salesChartData} options={{
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }} />
            </div>
            <div className="sales-table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.recentSales.map(sale => (
                    <tr key={sale.id}>
                      <td>{sale.product_name}</td>
                      <td>{sale.customer_name || 'N/A'}</td>
                      <td>{formatCurrency(sale.total_price)}</td>
                      <td>{new Date(sale.sale_date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Inventory Status Section */}
      <div className="dashboard-section">
        <h3>Inventory Status</h3>
        {dashboardData.loading.inventory ? (
          <div className="loading">Loading inventory data...</div>
        ) : dashboardData.error.inventory ? (
          <div className="error">{dashboardData.error.inventory}</div>
        ) : (
          <div className="inventory-content">
            <div className="inventory-chart">
              <Bar data={inventoryChartData} options={{
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }} />
            </div>
            <div className="inventory-table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>In Stock</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.inventory.map(item => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{formatCurrency(item.price)}</td>
                      <td>{item.quantity}</td>
                      <td>{formatCurrency(item.cost_price + item.expenses)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .dashboard-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .logout-button {
          background-color: #dc3545;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.3s;
        }
        .logout-button:hover {
          background-color: #c82333;
        }
        .dashboard-section {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          padding: 20px;
          margin-bottom: 20px;
        }
        h2, h3, h4 {
          color: #333;
          margin: 0 0 15px 0;
        }
        .loading {
          display: flex;
          justify-content: center;
          padding: 20px;
          color: #666;
        }
        .error {
          color: #dc3545;
          padding: 10px;
          background: #f8d7da;
          border-radius: 4px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .financial-content,
        .sales-content,
        .inventory-content {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
        }
        .financial-tables {
          display: flex;
          gap: 20px;
          flex: 1;
          min-width: 300px;
        }
        .financial-table {
          flex: 1;
          min-width: 200px;
        }
        .financial-chart,
        .sales-chart,
        .inventory-chart {
          flex: 1;
          min-width: 300px;
          height: 300px;
        }
        .sales-table,
        .inventory-table {
          flex: 1;
          min-width: 300px;
          overflow-x: auto;
        }
        @media (max-width: 768px) {
          .financial-content,
          .sales-content,
          .inventory-content {
            flex-direction: column;
          }
          .financial-tables {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default PrimaryPartnerDashboard;