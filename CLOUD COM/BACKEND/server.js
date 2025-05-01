const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '901017181',
    database: process.env.DB_NAME || 'iwb'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
        process.exit(1);
    }
    console.log('Connected to MySQL database.');
});

// ========== MIDDLEWARE ========== //
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    jwt.verify(token, process.env.JWT_SECRET || "secretkey", (err, decoded) => {
        if (err) return res.status(403).json({ message: "Invalid token" });
        req.user = decoded;
        next();
    });
};

// ========== AUTHENTICATION ROUTES ========== //
// ========== AUTHENTICATION ROUTES ========== //
// ========== AUTHENTICATION ROUTES ========== //
app.post('/register', async (req, res) => {
    const { name, email, password, role } = req.body;

    // Input validation
    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: "All fields are required" });
    }

    // Role validation
    const validRoles = ["sales", "finance", "developer", "investor", "client", "primary_partner"];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role selection!" });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
    }

    // Password validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ 
            message: "Password must contain: 8+ characters, uppercase, lowercase, number, and special character"
        });
    }

    // Check if email exists
    const emailCheckQuery = `SELECT COUNT(*) AS count FROM users WHERE email = ?`;
    db.query(emailCheckQuery, [email], async (err, result) => {
        if (err) return res.status(500).json({ message: "Database error" });

        if (result[0].count > 0) {
            return res.status(409).json({ message: "Email already registered" });
        }

        // Role limit check
        const roleCountQuery = `SELECT COUNT(*) AS count FROM users WHERE role = ?`;
        db.query(roleCountQuery, [role], async (err, result) => {
            if (err) return res.status(500).json({ message: "Database error" });

            const roleCount = result[0].count;
            const roleLimits = {
                sales: 3,
                finance: 3,
                developer: 3,
                investor: 10,
                client: 100,
                primary_partner: 3
            };

            if (roleCount >= (roleLimits[role] || 3)) {
                return res.status(403).json({ 
                    message: `Registration denied. Max ${roleLimits[role] || 3} ${role} accounts allowed.`
                });
            }

            try {
                const hashedPassword = await bcrypt.hash(password, 12);
                const insertQuery = `INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, NOW())`;
                
                db.query(insertQuery, [name, email, hashedPassword, role], (err, result) => {
                    if (err) {
                        console.error("Registration error:", err);
                        return res.status(500).json({ 
                            message: "Registration failed",
                            error: process.env.NODE_ENV === 'development' ? err.message : undefined
                        });
                    }

                    res.status(201).json({ 
                        success: true,
                        message: "User registered successfully",
                        user: { name, email, role }
                    });
                });
            } catch (error) {
                console.error("Registration error:", error);
                res.status(500).json({ 
                    message: "Server error during registration",
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        });
    });
});

/*
app.post('/register', async (req, res) => {
    const { name, email, password, role } = req.body;

    if (!["sales", "finance", "developer", "investor", "client"].includes(role)) {
        return res.status(400).json({ message: "Invalid role selection!" });
    }

    const countQuery = `SELECT COUNT(*) AS count FROM users WHERE role = ?`;
    db.query(countQuery, [role], async (err, result) => {
        if (err) return res.status(500).json({ message: "Database error" });

        const roleCount = result[0].count;
        if (roleCount >= 3) {
            return res.status(403).json({ message: `Registration denied. Max 3 ${role} accounts allowed.` });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const insertQuery = `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`;
            db.query(insertQuery, [name, email, hashedPassword, role], (err, result) => {
                if (err) return res.status(500).json({ error: err });
                res.status(201).json({ message: "User registered successfully" });
            });
        } catch (error) {
            res.status(500).json({ message: "Server error during registration!" });
        }
    });
});
*/
app.post('/login', async (req, res) => {
    const { email, password, role } = req.body;

    try {
        db.query(`SELECT * FROM users WHERE email = ?`, [email], async (err, results) => {
            if (err) return res.status(500).json({ error: "Database query error!" });

            if (results.length === 0) {
                return res.status(400).json({ message: "User not found" });
            }

            const user = results[0];
            if (user.role !== role) {
                return res.status(403).json({ message: "Invalid role selection!" });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const token = jwt.sign(
                { id: user.id, role: user.role }, 
                process.env.JWT_SECRET || "secretkey", 
                { expiresIn: '1h' }
            );

            res.json({ token, user });
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: "Server error during login!" });
    }
});

app.get('/profile', verifyToken, (req, res) => {
    db.query(`SELECT id, name, email, role FROM users WHERE id = ?`, [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results[0]);
    });
});

// ========== PRODUCT ROUTES ========== //
app.get('/products', (req, res) => {
    db.query('SELECT * FROM products', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/products', (req, res) => {
    db.query('SELECT * FROM products WHERE quantity > 0', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/products', verifyToken, (req, res) => {
    const { name, description, cost_price, expenses, price, quantity } = req.body;
    const query = `INSERT INTO products (name, description, cost_price, expenses, price, quantity) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(query, [name, description, cost_price, expenses, price, quantity], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product added successfully!" });
    });
});

app.put('/products/:id', verifyToken, (req, res) => {
    const { id } = req.params;
    const { name, description, cost_price, expenses, price, quantity } = req.body;
    const query = `UPDATE products SET name = ?, description = ?, cost_price = ?, expenses = ?, price = ?, quantity = ? WHERE id = ?`;
    db.query(query, [name, description, cost_price, expenses, price, quantity, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product updated successfully!" });
    });
});

app.delete('/products/:id', verifyToken, (req, res) => {
    const { id } = req.params;
    const query = `DELETE FROM products WHERE id = ?`;
    db.query(query, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product deleted successfully!" });
    });
});

// ========== SALES ROUTES ========== //
app.get('/sales', verifyToken, (req, res) => {
    const query = `
        SELECT sales.id, sales.quantity, sales.total_price, sales.sale_date, 
               products.name AS product_name, products.price AS product_price 
        FROM sales 
        JOIN products ON sales.product_id = products.id
        ORDER BY sales.sale_date DESC;
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/sales', verifyToken, (req, res) => {
    const { productId, quantity } = req.body;

    db.query(`SELECT quantity, price FROM products WHERE id = ?`, [productId], (err, result) => {
        if (err) return res.status(500).json({ error: "Error fetching product details." });
        if (result.length === 0) return res.status(404).json({ error: "Product not found." });

        const availableStock = result[0].quantity;
        const productPrice = result[0].price;

        if (quantity > availableStock) {
            return res.status(400).json({ error: "Not enough stock available." });
        }

        const totalPrice = productPrice * quantity;

        const query = `INSERT INTO sales (product_id, quantity, total_price) VALUES (?, ?, ?)`;
        db.query(query, [productId, quantity, totalPrice], (err, result) => {
            if (err) return res.status(500).json({ error: "Error recording sale." });

            db.query(`UPDATE products SET quantity = quantity - ? WHERE id = ?`, [quantity, productId], (err, updateResult) => {
                if (err) return res.status(500).json({ error: "Error updating stock." });
                res.json({ message: "Sale recorded successfully!" });
            });
        });
    });
});


app.post("/api/place-order", verifyToken, (req, res) => {
    const { productId, quantity, email, name } = req.body;

    if (!productId || !quantity || quantity < 1 || !email || !name) {
        return res.status(400).json({ error: "Invalid order data" });
    }

    db.query(`SELECT quantity, price FROM products WHERE id = ?`, [productId], (err, result) => {
        if (err) return res.status(500).json({ error: "Error fetching product details" });
        if (result.length === 0) return res.status(404).json({ error: "Product not found" });

        const availableStock = result[0].quantity;
        const productPrice = result[0].price;

        if (quantity > availableStock) {
            return res.status(400).json({ 
                error: `Only ${availableStock} units available`,
                availableStock
            });
        }

        const totalPrice = productPrice * quantity;
        const saleDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const query = `INSERT INTO sales (product_id, quantity, total_price, customer_email, customer_name, sale_date) 
                      VALUES (?, ?, ?, ?, ?, ?)`;
        
        db.query(query, [productId, quantity, totalPrice, email, name, saleDate], (err, result) => {
            if (err) return res.status(500).json({ error: "Error recording sale" });

            db.query(`UPDATE products SET quantity = quantity - ? WHERE id = ?`, 
            [quantity, productId], (err, updateResult) => {
                if (err) return res.status(500).json({ error: "Error updating stock" });
                
                res.json({ 
                    message: "Order placed successfully",
                    orderId: result.insertId,
                    totalPrice,
                    remainingStock: availableStock - quantity
                });
            });
        });
    });
});

// ========== FINANCE ROUTES ========== //
app.get("/finance/summary", verifyToken, async (req, res) => {
    const { period } = req.query;
  
    let dateCondition = "";
    switch (period) {
      case "daily":
        dateCondition = "WHERE DATE(s.sale_date) = CURDATE()";
        break;
      case "weekly":
        dateCondition = "WHERE YEARWEEK(s.sale_date, 1) = YEARWEEK(CURDATE(), 1)";
        break;
      case "monthly":
        dateCondition = "WHERE MONTH(s.sale_date) = MONTH(CURDATE()) AND YEAR(s.sale_date) = YEAR(CURDATE())";
        break;
      case "yearly":
        dateCondition = "WHERE YEAR(s.sale_date) = YEAR(CURDATE())";
        break;
      default:
        dateCondition = "";
    }
  
    try {
      const query = `
        SELECT
          COALESCE(SUM(s.total_price), 0) AS revenue,
          COALESCE(SUM((p.cost_price + p.expenses) * s.quantity), 0) AS expenses,
          COALESCE(SUM(s.total_price - (p.cost_price + p.expenses) * s.quantity), 0) AS profit
        FROM sales s
        JOIN products p ON s.product_id = p.id
        ${dateCondition}
      `;
  
      const [rows] = await db.promise().query(query);
      
      res.json({
        revenue: rows[0].revenue || 0,
        expenses: rows[0].expenses || 0,
        profit: rows[0].profit || 0
      });
      
    } catch (error) {
      console.error("Error fetching financial summary:", error);
      res.status(500).json({ 
        revenue: 0,
        expenses: 0,
        profit: 0,
        message: "Error fetching financial summary" 
      });
    }
});

app.get('/finance/revenue', verifyToken, (req, res) => {
    const query = `SELECT SUM(total_price) AS total_revenue FROM sales`;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ total_revenue: results[0].total_revenue || 0 });
    });
});

app.get('/finance/expenses', verifyToken, (req, res) => {
    const query = `SELECT SUM((cost_price + expenses) * quantity) AS total_expenses FROM products`;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ total_expenses: results[0].total_expenses || 0 });
    });
});

app.get('/investor/monthly-sales', verifyToken, (req, res) => {
    const query = `
        SELECT 
            DATE_FORMAT(sale_date, '%Y-%m') AS month,
            SUM(total_price) AS total_sales
        FROM sales
        GROUP BY DATE_FORMAT(sale_date, '%Y-%m')
        ORDER BY month ASC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ========== QUERY ROUTES ========== //
const getAutoReply = async (message) => {
    return new Promise((resolve) => {
        db.query(
            "SELECT auto_reply FROM queries WHERE MATCH(message) AGAINST (? IN NATURAL LANGUAGE MODE) ORDER BY created_at DESC LIMIT 1",
            [message],
            (err, results) => {
                if (err) {
                    console.error("Error finding auto-reply:", err);
                    return resolve(null);
                }
                if (results.length > 0) {
                    return resolve(results[0].auto_reply);
                }

                db.query(
                    "SELECT auto_reply FROM queries WHERE message LIKE ? ORDER BY created_at DESC LIMIT 1",
                    [`%${message}%`],
                    (err, results) => {
                        if (err || results.length === 0) {
                            return resolve(null);
                        }
                        return resolve(results[0].auto_reply);
                    }
                );
            }
        );
    });
};

app.post("/api/submit-query", verifyToken, async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        const autoReply = await getAutoReply(message);
        const status = autoReply ? "complete" : "pending";

        db.query(
            "INSERT INTO queries (customer_name, customer_email, message, auto_reply, status) VALUES (?, ?, ?, ?, ?)",
            [name, email, message, autoReply, status],
            (err, result) => {
                if (err) {
                    console.error("Query insert error:", err);
                    return res.status(500).json({ error: "Database error" });
                }
                res.status(201).json({
                    message: autoReply || "Your query has been received and is under review.",
                });
            }
        );
    } catch (error) {
        console.error("Error processing query:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/my-queries", verifyToken, (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    db.query("SELECT * FROM queries WHERE customer_email = ? ORDER BY created_at DESC", [email], (err, results) => {
        if (err) {
            console.error("Error fetching client queries:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

app.get("/queries", verifyToken, (req, res) => {
    db.query("SELECT * FROM queries ORDER BY created_at DESC", (err, results) => {
        if (err) {
            console.error("Error fetching queries:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

app.get("/queries/pending", verifyToken, (req, res) => {
    db.query("SELECT * FROM queries WHERE status = 'pending'", (err, results) => {
        if (err) {
            console.error("Error fetching pending queries:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

app.post("/queries/respond", verifyToken, (req, res) => {
    const { queryId, response } = req.body;

    const sql = "UPDATE queries SET auto_reply = ?, status = 'complete' WHERE id = ?";
    db.query(sql, [response, queryId], (err, result) => {
        if (err) {
            console.error("Error updating query:", err);
            return res.status(500).json({ error: "Failed to send response" });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Query not found" });
        }

        res.json({ message: "Response sent successfully!" });
    });
});

app.get("/api/query-stats", verifyToken, (req, res) => {
    const sql = `
        SELECT 
            COUNT(*) AS total_queries,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_queries,
            SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS completed_queries,
            SUM(CASE WHEN auto_reply IS NOT NULL THEN 1 ELSE 0 END) AS auto_replied
        FROM queries
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error("Error fetching query stats:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(result[0]);
    });
});


// ========== CLIENT SALES ROUTE ========== //
app.post('/api/place-sale', verifyToken, (req, res) => {
    const { client_name, client_email, product_id, quantity } = req.body;

    if (!client_name || !client_email || !product_id || !quantity || quantity < 1) {
        return res.status(400).json({ error: "Invalid purchase data" });
    }

    db.query(`SELECT quantity, price, name FROM products WHERE id = ?`, [product_id], (err, result) => {
        if (err) return res.status(500).json({ error: "Error fetching product details" });
        if (result.length === 0) return res.status(404).json({ error: "Product not found" });

        const availableStock = result[0].quantity;
        const productPrice = result[0].price;
        const productName = result[0].name;

        if (quantity > availableStock) {
            return res.status(400).json({ 
                error: `Only ${availableStock} units available`,
                availableStock
            });
        }

        const totalPrice = productPrice * quantity;
        const saleDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const insertQuery = `
            INSERT INTO sales (product_id, quantity, total_price, customer_email, customer_name, product_name, sale_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(insertQuery, [product_id, quantity, totalPrice, client_email, client_name, productName, saleDate], (err, result) => {
            if (err) return res.status(500).json({ error: "Error recording client sale" });

            db.query(`UPDATE products SET quantity = quantity - ? WHERE id = ?`, [quantity, product_id], (err, updateResult) => {
                if (err) return res.status(500).json({ error: "Error updating stock after sale" });

                res.json({ 
                    message: "Purchase placed successfully!",
                    totalPrice,
                    remainingStock: availableStock - quantity
                });
            });
        });
    });
});


// ========== VIEW CLIENT PURCHASES ROUTE ========== //
/*
app.get('/api/client-purchases', verifyToken, (req, res) => {
    const query = `
        SELECT 
            id,
            customer_name AS client_name,
            customer_email AS client_email,
            product_name,
            quantity,
            total_price,
            sale_date AS purchase_date
        FROM sales
        WHERE customer_email IS NOT NULL
        ORDER BY sale_date DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching client purchases:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});
*/


// ========== SYSTEM ROUTES ========== //
app.get("/api/system-status", (req, res) => {
    res.json({
        database: "MySQL Connected",
        uptime: process.uptime(),
        env: process.env.NODE_ENV || "development"
    });
});

app.get('/', (req, res) => {
    res.send('API is running...');
});

// Add to server.js

// Get client purchases with filtering
// Keep this one (modified version)
app.get('/api/client-purchases', verifyToken, (req, res) => {
    const { status, startDate, endDate, email } = req.query;
    
    let query = `
      SELECT 
        s.id,
        s.customer_name AS client_name,
        s.customer_email AS client_email,
        s.product_name,
        s.quantity,
        s.total_price,
        s.sale_date AS purchase_date,
        s.order_status
      FROM sales s
      WHERE s.customer_email IS NOT NULL
    `;
    
    const params = [];
    
    // Add email filter if provided
    if (email) {
      query += ' AND s.customer_email = ?';
      params.push(email);
    }
    
    if (status && status !== 'all') {
      query += ' AND s.order_status = ?';
      params.push(status);
    }
    
    if (startDate) {
      query += ' AND DATE(s.sale_date) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(s.sale_date) <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY s.sale_date DESC';
    
    db.query(query, params, (err, results) => {
      if (err) {
        console.error('Error fetching client purchases:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    });
});
/*
app.get('/api/client-purchases', verifyToken, (req, res) => {
    const { status, startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        s.id,
        s.customer_name,
        s.customer_email,
        s.product_name,
        s.quantity,
        s.total_price,
        s.sale_date,
        s.order_status,
        s.payment_method,
        s.shipping_address
      FROM sales s
      WHERE s.customer_email IS NOT NULL
    `;
    
    const params = [];
    
    if (status && status !== 'all') {
      query += ' AND s.order_status = ?';
      params.push(status);
    }
    
    if (startDate) {
      query += ' AND DATE(s.sale_date) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(s.sale_date) <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY s.sale_date DESC';
    
    db.query(query, params, (err, results) => {
      if (err) {
        console.error('Error fetching client purchases:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    });
  });
  */
  
  // Update order status
  app.put('/sales/:id/status', verifyToken, (req, res) => {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    if (!['processing', 'purchased', 'refunded'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const query = `
      UPDATE sales 
      SET order_status = ?, 
          ${status === 'cancelled' ? 'rejection_reason = ?' : 'rejection_reason = NULL'}
      WHERE id = ?
    `;
    
    const params = status === 'cancelled' ? [status, reason, id] : [status, id];
    
    db.query(query, params, (err, result) => {
      if (err) {
        console.error('Error updating order status:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json({ message: 'Order status updated successfully' });
    });
  });

//============Developer

// In your server.js
app.get('/api/system-status', verifyToken, (req, res) => {
    res.json({
      database: { status: 'healthy' },
      authService: { status: 'running' },
      apiService: { status: 'active' }
    });
  });
  
  app.post('/api/backups', verifyToken, (req, res) => {
    // Implement actual backup logic
    res.json({ success: true });
  });
  

  
  // ========== PRIMARY PARTNER SPECIFIC ROUTES ========== //
app.get('/primary-partner/financial-summary', verifyToken, async (req, res) => {
    try {
        // Monthly summary
        const monthlyQuery = `
            SELECT
                COALESCE(SUM(s.total_price), 0) AS revenue,
                COALESCE(SUM((p.cost_price + p.expenses) * s.quantity), 0) AS expenses,
                COALESCE(SUM(s.total_price - (p.cost_price + p.expenses) * s.quantity), 0) AS profit
            FROM sales s
            JOIN products p ON s.product_id = p.id
            WHERE MONTH(s.sale_date) = MONTH(CURDATE()) 
            AND YEAR(s.sale_date) = YEAR(CURDATE())
        `;
        
        // Yearly summary
        const yearlyQuery = `
            SELECT
                COALESCE(SUM(s.total_price), 0) AS revenue,
                COALESCE(SUM((p.cost_price + p.expenses) * s.quantity), 0) AS expenses,
                COALESCE(SUM(s.total_price - (p.cost_price + p.expenses) * s.quantity), 0) AS profit
            FROM sales s
            JOIN products p ON s.product_id = p.id
            WHERE YEAR(s.sale_date) = YEAR(CURDATE())
        `;
        
        const [monthlyRows] = await db.promise().query(monthlyQuery);
        const [yearlyRows] = await db.promise().query(yearlyQuery);
        
        res.json({
            monthly: {
                revenue: monthlyRows[0]?.revenue || 0,
                expenses: monthlyRows[0]?.expenses || 0,
                profit: monthlyRows[0]?.profit || 0
            },
            yearly: {
                revenue: yearlyRows[0]?.revenue || 0,
                expenses: yearlyRows[0]?.expenses || 0,
                profit: yearlyRows[0]?.profit || 0
            }
        });
    } catch (error) {
        console.error("Primary Partner Financial Summary Error:", error);
        res.status(500).json({ 
            monthly: { revenue: 0, expenses: 0, profit: 0 },
            yearly: { revenue: 0, expenses: 0, profit: 0 },
            message: "Error fetching financial summary"
        });
    }
});

app.get('/primary-partner/recent-sales', verifyToken, (req, res) => {
    const query = `
        SELECT 
            s.id, 
            s.quantity, 
            s.total_price, 
            s.sale_date,
            p.name AS product_name,
            s.customer_name,
            s.customer_email
        FROM sales s
        JOIN products p ON s.product_id = p.id
        ORDER BY s.sale_date DESC
        LIMIT 10
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("Primary Partner Recent Sales Error:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

app.get('/primary-partner/inventory-status', verifyToken, (req, res) => {
    const query = `
        SELECT 
            id, 
            name, 
            price, 
            quantity,
            cost_price,
            expenses
        FROM products
        ORDER BY quantity ASC
        LIMIT 10
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("Primary Partner Inventory Error:", err);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results);
    });
});

//================Developer
/* 
// ========== DEVELOPER SYSTEM HEALTH APIS ========== //
app.get('/developer/system-health', verifyToken, async (req, res) => {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        // Check if system_logs table exists
        const [tables] = await db.promise().query(`
            SHOW TABLES LIKE 'system_logs'
        `);

        const systemLogsExists = tables.length > 0;

        // Get basic counts
        const [counts] = await db.promise().query(`
            SELECT 
                (SELECT COUNT(*) FROM users) AS user_count,
                (SELECT COUNT(*) FROM sales) AS sales_count,
                (SELECT COUNT(*) FROM queries) AS query_count,
                (SELECT COUNT(*) FROM products) AS product_count
        `);

        // Get database status
        const [statusResults] = await db.promise().query("SHOW STATUS");
        const dbStatus = statusResults.reduce((acc, row) => {
            acc[row.Variable_name] = row.Value;
            return acc;
        }, {});

        // Get error logs if table exists
        let errorLogs = [];
        if (systemLogsExists) {
            const [logs] = await db.promise().query(`
                SELECT COUNT(*) AS error_count 
                FROM system_logs 
                WHERE level = 'ERROR'
            `);
            errorLogs = logs;
        }

        res.json({
            database: {
                connections: dbStatus.Threads_connected || 0,
                uptime: dbStatus.Uptime ? `${Math.floor(dbStatus.Uptime / 3600)} hours` : 'N/A',
                queries: counts[0].query_count,
                sales: counts[0].sales_count,
                users: counts[0].user_count,
                products: counts[0].product_count,
                errors: systemLogsExists ? errorLogs[0]?.error_count || 0 : 'Table not exists'
            },
            server: {
                status: 'online',
                memory: {
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
                },
                uptime: process.uptime(),
                environment: process.env.NODE_ENV || 'development'
            },
            system_logs_exists: systemLogsExists,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('System health error:', error);
        res.status(500).json({
            error: "Failed to get system health",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.get('/developer/error-logs', verifyToken, async (req, res) => {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        // Check if table exists first
        const [tables] = await db.promise().query(`
            SHOW TABLES LIKE 'system_logs'
        `);

        if (tables.length === 0) {
            return res.json([
                {
                    id: -1,
                    message: 'system_logs table does not exist',
                    level: 'ERROR',
                    service: 'System',
                    timestamp: new Date().toISOString()
                }
            ]);
        }

        // Get logs if table exists
        const [logs] = await db.promise().query(`
            SELECT 
                id,
                message,
                level,
                service,
                created_at AS timestamp
            FROM system_logs
            ORDER BY created_at DESC
            LIMIT 10
        `);

        res.json(logs.length > 0 ? logs : [
            {
                id: -2,
                message: 'No error logs found',
                level: 'INFO',
                service: 'System',
                timestamp: new Date().toISOString()
            }
        ]);
    } catch (error) {
        console.error('Error logs error:', error);
        res.json([
            {
                id: -3,
                message: 'Failed to fetch error logs: ' + error.message,
                level: 'ERROR',
                service: 'API',
                timestamp: new Date().toISOString()
            }
        ]);
    }
});

// Add this endpoint to create the table if needed
app.post('/developer/create-logs-table', verifyToken, async (req, res) => {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS system_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                message TEXT NOT NULL,
                level ENUM('INFO', 'WARN', 'ERROR') NOT NULL DEFAULT 'INFO',
                service VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        res.json({ success: true, message: 'system_logs table created' });
    } catch (error) {
        console.error('Create table error:', error);
        res.status(500).json({ error: 'Failed to create table' });
    }
});*/
// ========== DEVELOPER SYSTEM HEALTH APIS ========== //
app.get('/developer/system-health', verifyToken, async (req, res) => {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        // Get database metrics
        const [dbResults] = await db.promise().query(`
            SELECT 
                (SELECT COUNT(*) FROM users) AS user_count,
                (SELECT COUNT(*) FROM sales) AS sales_count,
                (SELECT COUNT(*) FROM queries) AS query_count,
                (SELECT COUNT(*) FROM products) AS product_count
        `);

        // Get database status
        const [statusResults] = await db.promise().query("SHOW STATUS");
        const dbStatus = statusResults.reduce((acc, row) => {
            acc[row.Variable_name] = row.Value;
            return acc;
        }, {});

        res.json({
            database: {
                connections: dbStatus.Threads_connected || 0,
                uptime: dbStatus.Uptime ? `${Math.floor(dbStatus.Uptime / 3600)} hours` : 'N/A',
                queries: dbResults[0].query_count,
                sales: dbResults[0].sales_count,
                users: dbResults[0].user_count,
                products: dbResults[0].product_count
            },
            server: {
                status: 'online',
                memory: {
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
                },
                uptime: process.uptime(),
                environment: process.env.NODE_ENV || 'development'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('System health error:', error);
        res.status(500).json({
            error: "Failed to get system health",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            fallbackData: {
                database: {
                    connections: 0,
                    uptime: 'N/A',
                    queries: 0,
                    sales: 0,
                    users: 0,
                    products: 0
                },
                server: {
                    status: 'error',
                    memory: {
                        total: 0,
                        used: 0,
                        rss: 0
                    },
                    uptime: 0
                }
            }
        });
    }
});

app.get('/developer/error-logs', verifyToken, async (req, res) => {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        // Get last 10 error logs from database
        const [logs] = await db.promise().query(`
            SELECT 
                id,
                message,
                level,
                service,
                created_at AS timestamp
            FROM system_logs
            ORDER BY created_at DESC
            LIMIT 10
        `);

        // If no logs table exists, return mock data
        if (!logs.length) {
            return res.json([
                {
                    id: 1,
                    message: 'No error logs found in database',
                    level: 'INFO',
                    service: 'System',
                    timestamp: new Date().toISOString()
                }
            ]);
        }

        res.json(logs);
    } catch (error) {
        console.error('Error logs error:', error);
        res.json([
            {
                id: -1,
                message: 'Failed to fetch error logs: ' + error.message,
                level: 'ERROR',
                service: 'API',
                timestamp: new Date().toISOString()
            }
        ]);
    }
});

// ========== DEVELOPER USER MANAGEMENT ========== //
app.get('/developer/users', verifyToken, async (req, res) => {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const [users] = await db.promise().query(`
            SELECT id, name, email, role, created_at 
            FROM users
            ORDER BY created_at DESC
        `);
        res.json(users);
    } catch (error) {
        console.error('User fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.put('/developer/users/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;
    const { name, email, role } = req.body;

    try {
        // Validate role
        const validRoles = ["sales", "finance", "developer", "investor", "client", "primary_partner"];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        await db.promise().query(`
            UPDATE users 
            SET name = ?, email = ?, role = ?
            WHERE id = ?
        `, [name, email, role, id]);

        res.json({ success: true, message: 'User updated successfully' });
    } catch (error) {
        console.error('User update error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.delete('/developer/users/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;

    try {
        // Prevent deleting last developer
        const [user] = await db.promise().query('SELECT role FROM users WHERE id = ?', [id]);
        if (user[0].role === 'developer') {
            const [devs] = await db.promise().query('SELECT COUNT(*) AS count FROM users WHERE role = "developer"');
            if (devs[0].count <= 1) {
                return res.status(400).json({ error: 'Cannot delete last developer' });
            }
        }

        await db.promise().query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('User delete error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ========== DEVELOPER QUERY MANAGEMENT ========== //
app.get('/developer/queries', verifyToken, async (req, res) => {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const [queries] = await db.promise().query(`
            SELECT id, customer_name, customer_email, message, 
                   auto_reply, status, created_at
            FROM queries
            ORDER BY created_at DESC
            LIMIT 50
        `);
        res.json(queries);
    } catch (error) {
        console.error('Query fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch queries' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});