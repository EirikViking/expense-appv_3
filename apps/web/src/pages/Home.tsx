import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="px-4 py-12 text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Personal Expense Analytics
      </h1>
      <p className="text-xl text-gray-600 mb-8">
        Track and analyze your Norwegian bank and credit card transactions
      </p>

      <div className="space-y-4">
        {isAuthenticated ? (
          <div className="space-x-4">
            <Link
              to="/upload"
              className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Upload Files
            </Link>
            <Link
              to="/transactions"
              className="inline-block px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
            >
              View Transactions
            </Link>
          </div>
        ) : (
          <Link
            to="/login"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign In
          </Link>
        )}
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            XLSX Import
          </h3>
          <p className="text-gray-600">
            Import credit card exports in Norwegian format with automatic column detection
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            PDF Import
          </h3>
          <p className="text-gray-600">
            Extract transactions from bank statements with pending/booked status tracking
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Deduplication
          </h3>
          <p className="text-gray-600">
            File and transaction-level deduplication prevents duplicates across uploads
          </p>
        </div>
      </div>
    </div>
  );
}
