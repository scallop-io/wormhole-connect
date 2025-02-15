import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { Chip, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { RootState } from 'store';
import { setTransferRoute } from 'store/transferInput';
import { LINK, joinClass } from 'utils/style';
import { toFixedDecimals } from 'utils/balance';
import { millisToMinutesAndSeconds } from 'utils/transferValidation';
import { calculateUSDPrice, getDisplayName } from 'utils';
import config from 'config';
import { RoutesConfig, RouteData } from 'config/routes';

import BridgeCollapse, { CollapseControlStyle } from './Collapse';
import TokenIcon from 'icons/TokenIcons';
import ArrowRightIcon from 'icons/ArrowRight';
import Options from 'components/Options';
import Price from 'components/Price';
import { finality, Chain } from '@wormhole-foundation/sdk';
import useAvailableRoutes from 'hooks/useAvailableRoutes';

const useStyles = makeStyles()((theme: any) => ({
  link: {
    ...LINK(theme),
    margin: '0 0 0 4px',
  },
  tag: {
    padding: '4px 8px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    [theme.breakpoints.down('sm')]: {
      padding: '4px 0',
      backgroundColor: 'transparent !important',
    },
  },
  filled: {
    backgroundColor: theme.palette.card.secondary,
  },
  tagIcon: {
    [theme.breakpoints.down('sm')]: {
      display: 'none',
    },
  },
  route: {
    [theme.breakpoints.up('sm')]: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr',
      gridTemplateAreas: `"path fees"`,
    },
    [theme.breakpoints.down('sm')]: {
      display: 'flex',
      flexDirection: 'column',
    },
    width: '100%',
    maxWidth: '100%',
    fontSize: '14px',
  },
  disabled: {
    color: 'grey',
    cursor: 'default',
  },
  routeLeft: {
    gridArea: 'path',
    display: 'flex',
    flexDirection: 'column',
  },
  routeTitle: {
    display: 'flex',
    [theme.breakpoints.down('sm')]: {
      flexDirection: 'column',
    },
    [theme.breakpoints.up('sm')]: {
      flexDirection: 'row',
    },
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '8px',
    whiteSpace: 'nowrap',
  },
  routePath: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    [theme.breakpoints.down('sm')]: {
      gap: '4px',
      alignContent: 'center',
    },
  },
  routeRight: {
    gridArea: 'fees',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    padding: '4px 0',
    height: '100%',
  },
  routeAmt: {
    opacity: '0.6',
    fontSize: '12px',
  },
  multiLineChip: {
    [theme.breakpoints.down('sm')]: {
      height: 'auto',
      '& .MuiChip-label': {
        display: 'block',
        whiteSpace: 'normal',
        textAlign: 'center',
        maxWidth: '256px',
      },
    },
  },
}));

export function Banner(props: { text?: string; route?: RouteData }) {
  const { classes } = useStyles();
  const text = props.text || 'This route provided by';
  const route = useSelector((state: RootState) => state.transferInput.route);

  const displayRoute = route && (props.route || RoutesConfig[route]);

  return displayRoute ? (
    <>
      {text}
      <a
        href={displayRoute.link}
        target="_blank"
        className={classes.link}
        rel="noreferrer"
      >
        {displayRoute.providedBy}
      </a>
    </>
  ) : (
    <></>
  );
}

type TagProps = {
  icon: JSX.Element;
  text: string;
  colorFilled?: boolean;
  height?: number;
};
function Tag(props: TagProps) {
  const { classes } = useStyles();
  const height = props.height || 20;

  return (
    <div
      className={joinClass([
        classes.tag,
        !!props.colorFilled && classes.filled,
      ])}
    >
      <div
        style={{ height: height, width: height }}
        className={classes.tagIcon}
      >
        {props.icon}
      </div>
      {props.text}
    </div>
  );
}

const getEstimatedTime = (chain?: Chain) => {
  if (!chain) return undefined;
  const chainFinality = finality.finalityThreshold.get(chain);
  if (typeof chainFinality === 'undefined') return undefined;
  const blockTime = finality.blockTime.get(chain);
  if (blockTime === undefined) return undefined;
  return chainFinality === 0
    ? 'Instantly'
    : millisToMinutesAndSeconds(blockTime * chainFinality);
};

function RouteOption(props: { route: RouteData; disabled: boolean }) {
  const { classes } = useStyles();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { token, destToken, amount, toChain, fromChain } = useSelector(
    (state: RootState) => state.transferInput,
  );

  const { toNativeToken, relayerFee } = useSelector(
    (state: RootState) => state.relay,
  );
  const {
    usdPrices: { data },
  } = useSelector((state: RootState) => state.tokenPrices);
  const prices = data || {};
  const portico = useSelector((state: RootState) => state.porticoBridge);
  const [receiveAmt, setReceiveAmt] = useState<number | undefined>(undefined);
  const [receiveAmtUSD, setReceiveAmtUSD] = useState<string | undefined>(
    undefined,
  );

  const [estimatedTime, setEstimatedTime] = useState<string | undefined>(
    undefined,
  );
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const routeOptions = { nativeGas: toNativeToken };

        const receiveAmt = await config.routes
          .get(props.route.name)
          .computeReceiveAmountWithFees(
            Number.parseFloat(amount),
            token,
            destToken,
            fromChain,
            toChain,
            routeOptions,
          );
        if (!cancelled) {
          setReceiveAmt(Number.parseFloat(toFixedDecimals(`${receiveAmt}`, 6)));
          setReceiveAmtUSD(
            calculateUSDPrice(receiveAmt, prices, config.tokens[destToken]),
          );
          setEstimatedTime(getEstimatedTime(fromChain));
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setReceiveAmt(0);
          setReceiveAmtUSD('');
          setEstimatedTime(getEstimatedTime(fromChain));
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    props.route,
    amount,
    toNativeToken,
    relayerFee,
    token,
    destToken,
    toChain,
    fromChain,
    portico,
    data,
  ]);
  const fromTokenConfig = config.tokens[token];
  const fromTokenIcon = fromTokenConfig && (
    <TokenIcon icon={fromTokenConfig.icon} height={20} />
  );
  const toTokenConfig = config.tokens[destToken];
  const toTokenIcon = toTokenConfig && (
    <TokenIcon icon={toTokenConfig.icon} height={20} />
  );
  const route = useMemo(() => {
    return config.routes.get(props.route.name);
  }, [props.route.name]);

  return (
    fromTokenConfig &&
    toTokenConfig && (
      <Tooltip
        title={
          props.disabled
            ? 'Not enough funds on the source chain for automatic redemption'
            : ''
        }
      >
        <div
          className={`${classes.route} ${
            props.disabled ? classes.disabled : ''
          }`}
          data-testid={`route-option-${props.route.name}`}
        >
          <div className={classes.routeLeft}>
            <div className={classes.routeTitle}>
              {props.route.displayName}
              {/* TODO: isAutomatic to route and use transfer parameters to decide */}
              {route.AUTOMATIC_DEPOSIT ? (
                <Chip
                  label="Receive tokens automatically"
                  color="success"
                  variant="outlined"
                  size="small"
                  className={classes.multiLineChip}
                />
              ) : (
                <Chip
                  label="Approve transfer with destination wallet"
                  color="warning"
                  variant="outlined"
                  size="small"
                  className={classes.multiLineChip}
                />
              )}
            </div>
            <div className={classes.routePath}>
              <Tag
                icon={fromTokenIcon}
                text={getDisplayName(fromTokenConfig)}
                colorFilled
              />
              <ArrowRightIcon fontSize={mobile ? 'inherit' : undefined} />
              {props.route.providedBy && (
                <Tag icon={props.route.icon()} text={props.route.providedBy} />
              )}
              <ArrowRightIcon fontSize={mobile ? 'inherit' : undefined} />
              <Tag
                icon={toTokenIcon}
                text={getDisplayName(toTokenConfig)}
                colorFilled
              />
            </div>
          </div>
          <div className={classes.routeRight}>
            {props.disabled ? (
              <>
                <div>Transfer amount too low</div>
              </>
            ) : (
              <>
                <div>
                  {receiveAmt} {getDisplayName(config.tokens[destToken])}
                  <Price textAlign="right">{receiveAmtUSD}</Price>
                </div>
                <div className={classes.routeAmt}>after fees</div>
                {typeof estimatedTime !== 'undefined' && (
                  <div className={classes.routeAmt}>
                    Estimated time: {estimatedTime}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Tooltip>
    )
  );
}

function RouteOptions() {
  const dispatch = useDispatch();
  const { isTransactionInProgress, route, routeStates } = useSelector(
    (state: RootState) => state.transferInput,
  );

  useAvailableRoutes();

  const onSelect = useCallback(
    (value: string) => {
      if (routeStates && routeStates.some((rs) => rs.name === value)) {
        const route = routeStates.find((rs) => rs.name === value);
        if (route?.available) dispatch(setTransferRoute(value));
      }
    },
    [routeStates, dispatch],
  );

  const allRoutes = useMemo(() => {
    if (!routeStates) return [];
    const routes = routeStates.filter((rs) => rs.supported);
    return routes;
  }, [routeStates]);

  return allRoutes && allRoutes.length > 0 ? (
    <BridgeCollapse
      title="Route"
      disabled={isTransactionInProgress}
      banner={<Banner />}
      disableCollapse
      startClosed={false}
      onCollapseChange={() => {
        /* noop */
      }}
      controlStyle={CollapseControlStyle.None}
    >
      <Options active={route} onSelect={onSelect} collapsable collapsed={false}>
        {allRoutes.map(({ name, available }) => {
          return {
            key: name,
            disabled: !available,
            child: (
              <RouteOption disabled={!available} route={RoutesConfig[name]} />
            ),
          };
        })}
      </Options>
    </BridgeCollapse>
  ) : (
    <></>
  );
}

export default RouteOptions;
