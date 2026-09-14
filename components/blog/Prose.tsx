/** Article typography for the blog. There is no typography plugin in this project. */

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-11 text-2xl font-bold leading-snug text-[#2E2A2B] sm:text-[28px]">{children}</h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[17px] leading-[1.75] text-[#3D3739]">{children}</p>;
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="mt-4 space-y-3 pl-5 text-[17px] leading-[1.7] text-[#3D3739] list-disc marker:text-[#E8487F]">{children}</ul>;
}

/** A list row; `title` renders bold, run into the sentence. */
export function Item({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <li className="pl-1">
      {title && <strong className="text-[#2E2A2B]">{title} </strong>}
      {children}
    </li>
  );
}
