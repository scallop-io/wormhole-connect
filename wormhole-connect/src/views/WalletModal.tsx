import React, { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { makeStyles } from 'tss-react/mui';
import { useTheme } from '@mui/material/styles';
import CircularProgress from '@mui/material/CircularProgress';
import { useDispatch, useSelector } from 'react-redux';

import config from 'config';
import { RootState } from 'store';
import { setWalletModal } from 'store/router';
import {
  TransferWallet,
  WalletData,
  getWalletOptions,
  connectWallet,
} from 'utils/wallet';
import { CENTER } from 'utils/style';

import Header from 'components/Header';
import Modal from 'components/Modal';
import Spacer from 'components/Spacer';
import Scroll from 'components/Scroll';
import WalletIcon from 'icons/WalletIcons';
import Search from 'components/Search';
import AlertBanner from 'components/AlertBanner';
import { Chain } from '@wormhole-foundation/sdk';

const useStyles = makeStyles()((theme: any) => ({
  walletRow: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '16px 8px',
    transition: `background-color 0.4s`,
    cursor: 'pointer',
    fontSize: '16px',
    '&:hover': {
      backgroundColor: theme.palette.options.select,
    },
    '&:not(:last-child)': {
      borderBottom: `0.5px solid ${theme.palette.divider}`,
    },
  },
  walletRowLeft: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
  },
  context: {
    opacity: '0.6',
  },
  notInstalled: {
    opacity: '60%',
  },
  noResults: {
    ...CENTER,
    minHeight: '72px',
    maxWidth: '350px',
    margin: 'auto',
    flexDirection: 'column',
    marginBottom: '10px',
    gap: '8px',
  },
  noResultsTitle: {
    fontSize: '20px',
    fontWeight: '600',
  },
}));

type Props = {
  type: TransferWallet;
  chain?: Chain;
  onClose?: () => any;
};

const FAILED_TO_LOAD_ERR =
  'Failed to load wallets. Please refresh and try again.';

type GetWalletsLoading = {
  state: 'loading';
};
type GetWalletsError = {
  state: 'error';
  error: string;
};
type GetWalletsResult = {
  state: 'result';
  options: WalletData[];
};

type GetWallets = GetWalletsLoading | GetWalletsError | GetWalletsResult;

function WalletsModal(props: Props) {
  const theme: any = useTheme();
  const { classes } = useStyles(theme);
  const { chain: chainProp, type } = props;
  const dispatch = useDispatch();
  const { fromChain, toChain } = useSelector(
    (state: RootState) => state.transferInput,
  );

  const [walletOptionsResult, setWalletOptionsResult] = useState<GetWallets>({
    state: 'loading',
  });
  const [search, setSearch] = useState('');
  const supportedChains = useMemo(() => {
    const networkContext = config.chainsArr.map((chain) => chain.context);
    return new Set(networkContext);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function getAvailableWallets() {
      const chain =
        chainProp || (type === TransferWallet.SENDING ? fromChain : toChain);

      const chainConfig = config.chains[chain!]!;

      if (supportedChains.has(chainConfig.context)) {
        return await getWalletOptions(chainConfig);
      } else {
        return [];
      }
    }
    (async () => {
      try {
        const options = await getAvailableWallets();
        if (!cancelled && options) {
          setWalletOptionsResult({
            state: 'result',
            options,
          });
        }
      } catch (e) {
        setWalletOptionsResult({ state: 'error', error: FAILED_TO_LOAD_ERR });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromChain, toChain, props.chain, chainProp, type, supportedChains]);

  const handleSearch = (
    e:
      | ChangeEvent<HTMLInputElement>
      | ChangeEvent<HTMLTextAreaElement>
      | undefined,
  ) => {
    if (!e) return;
    const lowercase = e.target.value.toLowerCase();
    setSearch(lowercase);
  };

  const connect = async (walletInfo: WalletData) => {
    const chain = type === TransferWallet.SENDING ? fromChain : toChain;
    dispatch(setWalletModal(false));
    if (props.onClose) props.onClose();
    await connectWallet(props.type, chain!, walletInfo, dispatch);
  };

  const displayWalletOptions = (wallets: WalletData[]): JSX.Element[] => {
    const sorted = wallets.sort((w) => (w.isReady ? -1 : 1));
    const predicate = ({ name, type }: WalletData) =>
      name.toLowerCase().includes(search) ||
      type.toLowerCase().includes(search);
    const filtered = !search ? sorted : sorted.filter(predicate);
    return filtered.map((wallet, i) => {
      const ready = wallet.isReady;
      const select = ready
        ? () => connect(wallet)
        : () => window.open(wallet.wallet.getUrl());
      return (
        <div className={classes.walletRow} key={i} onClick={select}>
          <div className={classes.walletRowLeft}>
            <WalletIcon name={wallet.name} icon={wallet.icon} height={32} />
            <div className={`${!ready && classes.notInstalled}`}>
              {!ready && 'Install'} {wallet.name}
            </div>
          </div>
          <div className={classes.context}>{wallet.type.toUpperCase()}</div>
        </div>
      );
    });
  };
  const closeWalletModal = () => {
    if (props.onClose) {
      props.onClose();
    } else {
      dispatch(setWalletModal(false));
    }
  };

  const renderContent = (): JSX.Element => {
    if (walletOptionsResult.state === 'loading') {
      return <CircularProgress />;
    } else if (walletOptionsResult.state === 'error') {
      return (
        <AlertBanner show={true} content={walletOptionsResult.error} error />
      );
    } else if (walletOptionsResult.state === 'result') {
      const { options } = walletOptionsResult;
      if (options.length > 0) {
        return (
          <>
            <Search placeholder="Search" onChange={handleSearch} />
            <Spacer height={16} />
            <Scroll
              height="calc(100vh - 250px)"
              blendColor={theme.palette.modal.background}
            >
              <div>{displayWalletOptions(options)}</div>
            </Scroll>
          </>
        );
      }
    }

    return (
      <div className={classes.noResults}>
        <div className={classes.noResultsTitle}>No wallets detected</div>
        <div>Install a wallet extension to continue</div>
      </div>
    );
  };

  return (
    <Modal open={!!props.type} closable width={500} onClose={closeWalletModal}>
      <Header text="Connect wallet" size={28} />
      <Spacer height={16} />
      {renderContent()}
    </Modal>
  );
}

export default WalletsModal;
