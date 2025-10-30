// Sources.jsx
import React from "react";

export const Sources = () => {
  const sourcesList = [
    {
      id: 1,
      source: "Congressional Research Service",
      title: "U.S. Agency for International Development: An Overview",
      url: "https://crsreports.congress.gov/product/pdf/IF/IF10261",
      publicationDate: "January 6, 2025",
      accessDate: "February 26, 2025",
    },
    {
      id: 2,
      source: "Pew Research Center",
      title: "What the data says about U.S. foreign aid",
      url: "https://www.pewresearch.org/short-reads/2025/02/06/what-the-data-says-about-us-foreign-aid/#how-big-is-foreign-aid-as-a-share-of-the-entire-federal-budget",
      publicationDate: "February 6, 2025",
      accessDate: "February 26, 2025",
    },
    {
      id: 3,
      source: "Kaiser Family Foundation",
      title: "Americans' Views on the U.S. Role in Global Health",
      url: "https://www.kff.org/global-health-policy/poll-finding/americans-views-on-the-u-s-role-in-global-health/",
      publicationDate: "January 20, 2016",
      accessDate: "February 26, 2025",
    },

    // Add more sources as needed
  ];

  return (
    <footer className="sources-section">
      <h2>Sources</h2>
      <ul className="sources-list">
        {sourcesList.map((source) => (
          <li key={source.id} className="source-item">
            <p>
              <span className="source-title">{source.title}</span>. Retrieved
              from{" "}
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.url}
              </a>{" "}
              (Accessed: {source.accessDate})
            </p>
          </li>
        ))}
      </ul>
    </footer>
  );
};
