import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import './ClientPurchase.css';

const ClientPurchase = () => {
    const API_BASE = "http://localhost:5000/api";
    const [purchaseData, setPurchaseData] = useState({ 
        productId: "", 
        quantity: "" 
    });
    const [paymentData, setPaymentData] = useState({
        cardNumber: "",
        expiryDate: "",
        cvv: "",
        cardName: ""
    });
    const [response, setResponse] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState([]);
    const [purchaseHistory, setPurchaseHistory] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateRange, setDateRange] = useState({
        start: "",
        end: ""
    });
    const navigate = useNavigate();

    useEffect(() => {
        const checkAuth = () => {
            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user'));

            if (!token || !user || user.role !== 'client') {
                navigate('/login');
                return false;
            }
            return true;
        };

        if (checkAuth()) {
            const user = JSON.parse(localStorage.getItem('user'));
            fetchAvailableProducts();
            fetchPurchaseHistory(user.email);
        }
    }, [navigate]);

    const fetchAvailableProducts = async () => {
        try {
            const res = await fetch(`${API_BASE}/products?available=true`);
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            
            const formattedProducts = data.map(product => ({
                ...product,
                price: Number(product.price) || 0
            }));
            
            setProducts(formattedProducts);
        } catch (err) {
            console.error("Error fetching products:", err);
            setError("Failed to load available products");
        }
    };

    const fetchPurchaseHistory = async (email) => {
        try {
            const res = await fetch(`${API_BASE}/client-purchases?email=${email}`, {
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            
            const formattedHistory = data.map(purchase => ({
                ...purchase,
                total_price: Number(purchase.total_price) || 0,
                sale_date: purchase.sale_date || purchase.purchase_date,
                product_name: purchase.product_name || "Unknown Product",
                transaction_status: purchase.transaction_status || "purchased" // Changed from order_status
            }));
            
            setPurchaseHistory(formattedHistory);
        } catch (err) {
            console.error("Error fetching purchase history:", err);
            setError("Failed to load purchase history");
        }
    };

    const filteredPurchases = (purchaseHistory || []).filter(purchase => {
        const productName = (purchase.product_name || '').toLowerCase();
        const transactionStatus = (purchase.transaction_status || 'purchased').toLowerCase(); // Updated
        const searchTermLower = searchTerm.toLowerCase();
        
        // Search by product name
        const matchesSearch = productName.includes(searchTermLower);
        
        // Filter by status
        const matchesStatus = statusFilter === "all" || 
                            transactionStatus === statusFilter.toLowerCase();
        
        // Filter by date range
        let matchesDate = true;
        try {
            const purchaseDate = purchase.sale_date ? new Date(purchase.sale_date) : null;
            const startDate = dateRange.start ? new Date(dateRange.start) : null;
            const endDate = dateRange.end ? new Date(dateRange.end) : null;
            
            if (purchaseDate) {
                if (startDate) matchesDate = matchesDate && purchaseDate >= startDate;
                if (endDate) {
                    const endOfDay = new Date(endDate);
                    endOfDay.setHours(23, 59, 59);
                    matchesDate = matchesDate && purchaseDate <= endOfDay;
                }
            }
        } catch (e) {
            console.error("Error processing dates:", e);
            matchesDate = false;
        }
        
        return matchesSearch && matchesStatus && matchesDate;
    });

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        navigate('/login');
    };

    const handlePurchaseChange = (e) => {
        const { name, value } = e.target;
        setPurchaseData(prev => ({ 
            ...prev, 
            [name]: name === 'quantity' ? Math.max(1, parseInt(value) || 1) : value 
        }));
    };

    const handlePaymentChange = (e) => {
        const { name, value } = e.target;

        if (name === "cardNumber") {
            const formattedValue = value.replace(/\s/g, '').replace(/(\d{4})/g, '$1 ').trim();
            setPaymentData(prev => ({ ...prev, [name]: formattedValue }));
            return;
        }

        if (name === "expiryDate" && value.length === 2 && !value.includes('/')) {
            setPaymentData(prev => ({ ...prev, [name]: value + '/' }));
            return;
        }

        setPaymentData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmitPurchase = async (e) => {
        e.preventDefault();
        
        if (!purchaseData.productId || !purchaseData.quantity || purchaseData.quantity < 1) {
            setError("Please select a product and valid quantity");
            return;
        }

        if (!paymentData.cardNumber || !paymentData.expiryDate || !paymentData.cvv || !paymentData.cardName) {
            setError("Please complete payment information");
            return;
        }

        setLoading(true);
        setError("");
        setResponse("");

        try {
            const user = JSON.parse(localStorage.getItem('user'));
            if (!user || !user.email) {
                throw new Error("User information missing");
            }

            const selectedProduct = products.find(p => p.id == purchaseData.productId);
            
            if (!selectedProduct) {
                throw new Error("Selected product not found");
            }

            if (selectedProduct.quantity < purchaseData.quantity) {
                throw new Error(`Only ${selectedProduct.quantity} units available`);
            }

            const res = await fetch(`${API_BASE}/complete-purchase`, { // Changed endpoint
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    productId: purchaseData.productId,
                    quantity: parseInt(purchaseData.quantity),
                    email: user.email,
                    name: user.name
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Purchase failed");

            setResponse(`Purchase successful! Transaction ID: ${data.transactionId}`); // Changed wording
            setPurchaseData({ productId: "", quantity: "" });
            setPaymentData({ cardNumber: "", expiryDate: "", cvv: "", cardName: "" });
            
            // Refresh data
            await fetchAvailableProducts();
            await fetchPurchaseHistory(user.email);
        } catch (err) {
            setError(err.message || "Failed to complete purchase");
        } finally {
            setLoading(false);
        }
    };

    const getStatusDisplay = (status) => {
        switch(status) {
            case 'processing': return 'Processing';
            case 'purchased': return 'Purchased';
            case 'refunded': return 'Refunded';
            default: return status;
        }
    };

    return (
        <div className="client-purchase-container">
            <header>
                <h2>Client Dashboard</h2>
                <button onClick={handleLogout} className="logout-btn">Logout</button>
                <nav>
                    <Link to="/clientpurchase" className="nav-link active">Make Purchase</Link>
                    <Link to="/clientquery" className="nav-link">Submit Query</Link>
                </nav>
            </header>

            <div className="purchase-content">
                <form onSubmit={handleSubmitPurchase} className="purchase-form">
                    <h3>Make a Purchase</h3>
                    
                    <div className="form-group">
                        <label>Select Product:</label>
                        <select 
                            name="productId" 
                            value={purchaseData.productId} 
                            onChange={handlePurchaseChange} 
                            required
                        >
                            <option value="">-- Select Product --</option>
                            {products.map(product => (
                                <option 
                                    key={product.id} 
                                    value={product.id}
                                    disabled={product.quantity <= 0}
                                >
                                    {product.name} - M{product.price.toFixed(2)} ({product.quantity} available)
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Quantity:</label>
                        <input 
                            type="number" 
                            name="quantity" 
                            value={purchaseData.quantity} 
                            onChange={handlePurchaseChange} 
                            required 
                            min="1"
                            max={products.find(p => p.id == purchaseData.productId)?.quantity || 1}
                            placeholder="Enter quantity" 
                        />
                    </div>

                    <div className="payment-section">
                        <h4>Payment Information</h4>
                        
                        <div className="form-group">
                            <label>Card Number:</label>
                            <input
                                type="text"
                                name="cardNumber"
                                value={paymentData.cardNumber}
                                onChange={handlePaymentChange}
                                maxLength="19"
                                placeholder="1234 5678 9012 3456"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Name on Card:</label>
                            <input
                                type="text"
                                name="cardName"
                                value={paymentData.cardName}
                                onChange={handlePaymentChange}
                                placeholder="John Doe"
                                required
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Expiry Date:</label>
                                <input
                                    type="text"
                                    name="expiryDate"
                                    value={paymentData.expiryDate}
                                    onChange={handlePaymentChange}
                                    maxLength="5"
                                    placeholder="MM/YY"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>CVV:</label>
                                <input
                                    type="text"
                                    name="cvv"
                                    value={paymentData.cvv}
                                    onChange={handlePaymentChange}
                                    maxLength="4"
                                    placeholder="123"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading || !purchaseData.productId}
                        className="submit-btn"
                    >
                        {loading ? "Processing..." : "Complete Purchase"}
                    </button>
                </form>

                <div className="purchase-history">
                    <h3>Your Purchase History</h3>
                    
                    <div className="search-section">
                        <div className="search-group">
                            <input
                                type="text"
                                placeholder="Search by product name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        <div className="filter-group">
                            <select 
                                value={statusFilter} 
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="all">All Transactions</option>
                                <option value="processing">Processing</option>
                                <option value="purchased">Purchased</option>
                                <option value="refunded">Refunded</option>
                            </select>
                        </div>
                        
                        <div className="date-filter-group">
                            <label>From:</label>
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                            />
                            
                            <label>To:</label>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                            />
                            
                            <button 
                                type="button" 
                                onClick={() => setDateRange({ start: "", end: "" })}
                                className="clear-btn"
                            >
                                Clear Dates
                            </button>
                        </div>
                    </div>

                    <p className="results-count">
                        Showing {filteredPurchases.length} of {purchaseHistory.length} transactions
                    </p>

                    {filteredPurchases.length > 0 ? (
                        <table className="purchase-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Product</th>
                                    <th>Quantity</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPurchases.map(purchase => (
                                    <tr key={purchase.id}>
                                        <td>{purchase.sale_date ? new Date(purchase.sale_date).toLocaleString() : 'N/A'}</td>
                                        <td>{purchase.product_name}</td>
                                        <td>{purchase.quantity}</td>
                                        <td>M{purchase.total_price.toFixed(2)}</td>
                                        <td className={`status status-${purchase.transaction_status}`}>
                                            {getStatusDisplay(purchase.transaction_status)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="no-purchases">
                            {purchaseHistory.length === 0 ? 'No purchases made yet' : 'No transactions match your search'}
                        </p>
                    )}
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}
            {response && <div className="success-message">{response}</div>}
        </div>
    );
};

export default ClientPurchase;