import { useEffect, useRef, useState } from 'react';
import { SQUARES } from './data';
import ChessboardViz from './ChessboardViz';
import GrainViz from './GrainViz';
import './App.css';

export default function App() {
  const [currentSquare, setCurrentSquare] = useState(1);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const onScroll = () => {
      const center = window.innerHeight / 2;
      const refs = stepRefs.current;
      for (let i = refs.length - 1; i >= 0; i--) {
        const el = refs[i];
        if (!el) continue;
        const { top } = el.getBoundingClientRect();
        if (top <= center) {
          setCurrentSquare(i + 1);
          return;
        }
      }
      setCurrentSquare(1);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="chessboard-rice-story">
      <header className="story-header">
        <h1>The Grain of Rice</h1>
        <p className="subtitle">
          A wise man asks a king for one grain of rice on the first square of a
          chessboard, two on the second, four on the third — doubling each square.
          The king laughs. He shouldn't.
        </p>
      </header>

      <div className="scrolly-container">
        {/* Left: sticky chessboard */}
        <div className="scrolly-viz">
          <ChessboardViz currentSquare={currentSquare} />
        </div>

        {/* Right: scroll steps, one per square */}
        <div className="scrolly-steps">
          {SQUARES.map((sq, i) => {
            const hasContent = !!(sq.annotation || sq.equivalent || sq.square <= 9);
            return (
              <div
                key={sq.square}
                ref={el => { stepRefs.current[i] = el; }}
                className={`scrolly-step ${hasContent ? 'has-content' : 'empty-step'}`}
              >
                {hasContent && (
                  <div className="step-inner">
                    <div className="step-square-num">Square {sq.square}</div>

                    {sq.annotation && (
                      <div className="step-annotation">
                        <h2>{sq.annotation.headline}</h2>
                        <p>{sq.annotation.body}</p>
                      </div>
                    )}

                    <GrainViz sq={sq} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="story-footer">
        <div className="sources-section">
          <h3>Sources &amp; notes</h3>
          <ul>
            <li>1 grain of rice ≈ 25 mg; typical long-grain rice</li>
            <li>World rice production ≈ 520 million tonnes/year (FAO, 2022–23 estimates)</li>
            <li>
              Object weights: egg ~55 g; Boeing 747-400 max takeoff 412,775 kg; Eiffel Tower iron
              structure 7,300 tonnes; Nimitz-class carrier ~102,000 tonnes displacement; Great
              Pyramid of Giza ~5.75 million tonnes
            </li>
            <li>The fable originates in ancient India/Persia — earliest written version attributed to the Shahnameh, c. 1010 CE</li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
