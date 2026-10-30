// 物件標頭（v14）：麵包屑、圖示塊＋標題＋標籤＋操作、說明、屬性列、分頁。每一頁最上面都是它
import { Fragment, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link } from '@tanstack/react-router';
import { useChrome } from '@/lib/chrome';
import { Icon, type IconName } from '@/lib/icons';

export type Attr = {
  label: string;
  value: ReactNode;
  /** 內容不是單一數字（部位分布、標籤…） */
  wide?: boolean;
};

/** 屬性列的數字：窄體斜體＋單位 */
export const AttrNum = ({ v, u, style }: { v: ReactNode; u?: string; style?: React.CSSProperties }) => (
  <div className="v" style={style}>
    {v}
    {u && <span className="u">{u}</span>}
  </div>
);

/** 標題左邊的深色圖示塊 */
export const ObjIcon = ({ name }: { name: IconName }) => (
  <span className="oav" aria-hidden>
    <Icon name={name} />
  </span>
);

/** 標題左邊的日期塊（訓練紀錄） */
export const ObjDate = ({ date }: { date: string }) => (
  <span className="oav date" aria-hidden>
    <small>{Number(date.slice(5, 7))}月</small>
    <b>{Number(date.slice(8))}</b>
  </span>
);

export function ObjectHeader({
  av,
  title,
  tags,
  actions,
  sub,
  attrs,
  tabs,
  className,
}: {
  av?: ReactNode;
  title: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
  sub?: ReactNode;
  attrs?: Attr[];
  tabs?: ReactNode;
  className?: string;
}) {
  const crumbs = useChrome((s) => s.crumbs);
  return (
    <div className={clsx('oh', className)}>
      <nav className="bc" aria-label="目前位置">
        <Icon name="home" />
        {crumbs.map((c, i) =>
          i < crumbs.length - 1 ? (
            <Fragment key={i}>
              {c.to ? (
                <Link to={c.to} params={c.params as never} search={c.search as never}>
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
              <Icon name="right" />
            </Fragment>
          ) : (
            <b key={i}>{c.label}</b>
          ),
        )}
      </nav>
      <div className="oh-t">
        {av}
        <h1>{title}</h1>
        {tags}
        <span className="sp" />
        {actions && <div className="acts">{actions}</div>}
      </div>
      {sub && <div className="oh-sub">{sub}</div>}
      {attrs && attrs.length > 0 && (
        <div className="oh-attrs">
          {attrs.map((a) => (
            <div key={a.label} className={clsx('at', a.wide && 'w')}>
              <span>{a.label}</span>
              {a.value}
            </div>
          ))}
        </div>
      )}
      {tabs ? (
        <div className="oh-tabs" role="tablist">
          {tabs}
        </div>
      ) : (
        <div className="oh-pad" />
      )}
    </div>
  );
}

/** 標頭下緣的分頁 */
export function OTab({
  on,
  icon,
  count,
  onClick,
  children,
}: {
  on: boolean;
  icon?: IconName;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      className={clsx('otab', on && 'on')}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      {children}
      {count != null && <span className="cnt">{count}</span>}
    </button>
  );
}
