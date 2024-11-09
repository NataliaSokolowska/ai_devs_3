"use client";

import { useState } from "react";

const FetchData = () => {
  const [flag, setFlag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/send-request-02", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setFlag(data.flag || "No flag found");
        setError(null);
      }
    } catch (err) {
      console.error("Error while fetching data:", err);
      setError("Error while fetching data");
    }
  };

  return (
    <div className="flex flex-col items-center p-4 bg-gray-100 min-h-screen">
      <button
        type="button"
        onClick={fetchData}
        className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-300mb-4"
      >
        Fetch Question and Flag
      </button>
      {error && (
        <p className="mt-4 text-red-500 font-medium text-center">{error}</p>
      )}
      {flag && (
        <p className="font-bold">
          Flaga:{" "}
          <span className="mt-4 text-green-600 font-semibold text-lg text-center">
            {flag}
          </span>
        </p>
      )}
    </div>
  );
};

export default FetchData;
